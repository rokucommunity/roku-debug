import { expect } from 'chai';
import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as sinonActual from 'sinon';
import type { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import { DebugSession, InitializedEvent, Logger as DapLogger, logger as dapLogger, ProgressEndEvent, ProgressStartEvent, ProgressUpdateEvent } from '@vscode/debugadapter';
import { BrightScriptDebugSession } from './BrightScriptDebugSession';
import type { AugmentedVariable } from './BrightScriptDebugSession';
import { fileUtils } from '../FileUtils';
import type { StackFrame } from '../adapters/TelnetAdapter';
import { PrimativeType, TelnetAdapter } from '../adapters/TelnetAdapter';
import { defer, util } from '../util';
import { HighLevelType } from '../interfaces';
import type { LaunchConfiguration } from '../LaunchConfiguration';
import type { SinonStub } from 'sinon';
import { DiagnosticSeverity, util as bscUtil, standardizePath as s } from 'brighterscript';
import { CompileError, DefaultFiles, rokuDeploy } from 'roku-deploy';
import type { AddProjectParams, ComponentLibraryConstructorParams } from '../managers/ProjectManager';
import { ComponentLibraryProject, Project } from '../managers/ProjectManager';
import { expectThrowsAsync } from '../testHelpers.spec';
import { RendezvousTracker } from '../RendezvousTracker';
import { ClientToServerCustomEventName, isCustomRequestEvent, isProcessCrashEvent, LogOutputEvent } from './Events';
import { EventEmitter } from 'eventemitter3';
import type { EvaluateContainer, Thread as AdapterThread } from '../adapters/DebugProtocolAdapter';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import { PerfettoManager } from '../PerfettoManager';

//DebugSession.shutdown() calls process.exit() after a sleep, so we need to prevent that during tests. This should not be a mock, it needs to be permanent for this flow
DebugSession.prototype.shutdown = () => { };

const sinon = sinonActual.createSandbox();
const tempDir = s`${__dirname}/../../.tmp`;
const rootDir = s`${tempDir}/rootDir`;
const outDir = s`${tempDir}/outDir`;
const stagingDir = s`${outDir}/stagingDir`;
const complib1Dir = s`${tempDir}/complib1`;

describe('BrightScriptDebugSession', () => {
    let responseDeferreds = [];
    let responses = [];

    afterEach(() => {
        fsExtra.emptydirSync(tempDir);
        fsExtra.removeSync(outDir);
        sinon.restore();
    });

    let session: BrightScriptDebugSession;

    let launchConfiguration: LaunchConfiguration;
    let initRequestArgs: DebugProtocol.InitializeRequestArguments;

    let rokuAdapter: TelnetAdapter;
    let errorSpy: sinon.SinonSpy;

    beforeEach(() => {
        fsExtra.emptydirSync(tempDir);
        sinon.restore();

        //prevent calling DebugSession.shutdown() because that calls process.kill(), which would kill the test session
        sinon.stub(DebugSession.prototype, 'shutdown').returns(null);

        try {
            session = new BrightScriptDebugSession();
            session['publishTimeout'] = 1_000;
        } catch (e) {
            console.log(e);
        }
        //always resolve the stagingDefered promise right away since most tests don't care about staging and this prevents a lot of unnecessary waiting
        session['stagingDefered'].resolve();

        errorSpy = sinon.spy(session.logger, 'error');
        //override the error response function and throw an exception so we can fail any tests
        (session as any).sendErrorResponse = (...args: string[]) => {
            throw new Error(args[2]);
        };
        launchConfiguration = {
            rootDir: rootDir,
            outDir: outDir,
            stagingDir: stagingDir,
            files: DefaultFiles
        } as any;
        session['launchConfiguration'] = launchConfiguration;
        session.projectManager.launchConfiguration = launchConfiguration;
        session.breakpointManager.launchConfiguration = launchConfiguration;
        initRequestArgs = {} as any;
        session['initRequestArgs'] = initRequestArgs;

        //mock the rokuDeploy module with promises so we can have predictable tests
        session.rokuDeploy = <any>{
            prepublishToStaging: () => {
                return Promise.resolve();
            },
            zipPackage: () => {
                return Promise.resolve();
            },
            pressHomeButton: () => {
                return Promise.resolve();
            },
            publish: () => {
                return Promise.resolve();
            },
            createPackage: () => {
                return Promise.resolve();
            },
            deploy: () => {
                return Promise.resolve();
            },
            getOptions: () => {
            },
            getFilePaths: () => {
            }
        };
        rokuAdapter = {
            emitter: new EventEmitter(),
            on: TelnetAdapter.prototype.on,
            once: TelnetAdapter.prototype.once,
            onReady: () => Promise.resolve(),
            emit: TelnetAdapter.prototype['emit'],
            activate: () => Promise.resolve(),
            registerSourceLocator: (a, b) => { },
            setConsoleOutput: (a) => { },
            evaluate: () => { },
            syncBreakpoints: () => { },
            getVariable: () => { },
            getScopeVariables: (a) => { },
            setExceptionBreakpoints: (a) => { },
            isScrapableContainObject: () => { },
            isTelnetAdapter: () => false,
            isDebugProtocolAdapter: () => true,
            getThreads: () => {
                return [];
            },
            getStackTrace: () => { }
        } as any;
        session['rokuAdapter'] = rokuAdapter;
        //mock the roku adapter
        session['connectRokuAdapter'] = () => {
            return Promise.resolve(rokuAdapter);
        };

        //clear out the responses before each test
        responses = [];
        responseDeferreds = [];

        sinon.stub(session, 'sendResponse').callsFake((response) => {
            responses.push(response);

            let filteredList = [];

            //notify waiting deferreds
            for (let deferred of responseDeferreds) {
                let index = (deferred).index;
                if (responses.length - 1 >= index) {
                    deferred.resolve(responses[index]);
                } else {
                    filteredList.push(deferred);
                }
            }
        });
    });

    afterEach(() => {
        fsExtra.emptydirSync(tempDir);
        fsExtra.removeSync(outDir);
        sinon.restore();
    });

    it('supports external zipping process', async function() {
        this.timeout(15_000);
        //write some project files
        fsExtra.outputFileSync(`${rootDir}/source/main.brs`, `
            sub main()
                print "hello"
            end sub
        `);
        fsExtra.outputFileSync(`${rootDir}/manifest`, '');

        const packagePath = s`${tempDir}/custom/app.zip`;

        //init the session
        session.initializeRequest({} as any, {} as any);

        //set a breakpoint in main
        await session.setBreakPointsRequest({} as any, {
            source: {
                path: s`${rootDir}/source/main.brs`
            },
            breakpoints: [{
                line: 2
            }]
        });

        sinon.stub(rokuDeploy, 'getDeviceInfo').returns(Promise.resolve({
            developerEnabled: true
        }));
        sinon.stub(util, 'dnsLookup').callsFake((host) => Promise.resolve(host));
        sinon.stub(session, 'setupProcessErrorHandlers');

        let sendEvent = session.sendEvent.bind(session);
        sinon.stub(session, 'sendEvent').callsFake((event) => {
            if (isCustomRequestEvent(event)) {
                void rokuDeploy.zipFolder(session['launchConfiguration'].stagingDir, packagePath).then(() => {
                    //pretend we are the client and send a response back
                    session.emit(ClientToServerCustomEventName.customRequestEventResponse, {
                        requestId: event.body.requestId
                    });
                });
            } else {
                //call through
                return sendEvent(event);
            }
        });
        sinon.stub(session as any, 'connectRokuAdapter').callsFake(() => {
            sinon.stub(session['rokuAdapter'], 'connect').returns(Promise.resolve());
            session['rokuAdapter'].connected = true;
            return Promise.resolve(session['rokuAdapter']);
        });

        const publishStub = sinon.stub(session.rokuDeploy, 'publish').callsFake(() => {
            //emit the app-ready event
            (session['rokuAdapter'] as TelnetAdapter)['emit']('app-ready');

            return Promise.resolve({
                message: 'success',
                results: []
            });
        });

        await session.launchRequest({} as any, {
            cwd: tempDir,
            //where the source files reside
            rootDir: rootDir,
            //where roku-debug should put the staged files (and inject breakpoints)
            stagingDir: `${stagingDir}/staging`,
            //the name of the task that should be run to create the zip (doesn't matter for this test...we're going to intercept it anyway)
            packageTask: 'custom-build',
            //where the packageTask will be placing the compiled zip
            packagePath: packagePath,
            packageUploadOverrides: {
                route: '1234',
                formData: {
                    one: 'two',
                    three: null
                }
            }
        } as Partial<LaunchConfiguration> as LaunchConfiguration);

        //publish now runs inside configurationDoneRequest, so invoke it to complete the launch flow
        await (session as any).configurationDoneRequest({} as any, {} as any);

        expect(publishStub.getCall(0).args[0].packageUploadOverrides).to.eql({
            route: '1234',
            formData: {
                one: 'two',
                three: null
            }
        });
    });

    describe('evaluateRequest', () => {
        it('resets local var counter on suspend', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);

            const stub = sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
                return Promise.resolve({ type: 'message', message: '' });
            });
            sinon.stub(rokuAdapter, 'getVariable').callsFake(x => {
                return Promise.resolve({
                    evaluateName: x,
                    highLevelType: 'primative',
                    value: '1'
                } as EvaluateContainer);
            });
            rokuAdapter.isAtDebuggerPrompt = true;
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '1+2', frameId: 1 } as DebugProtocol.EvaluateArguments
            );
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '2+3', frameId: 1 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(0).firstArg).to.eql(`if type(${session.tempVarPrefix}eval) = "<uninitialized>" then ${session.tempVarPrefix}eval = []\n`);
            expect(stub.getCall(1).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 1+2`);
            expect(stub.getCall(2).firstArg).to.eql(`${session.tempVarPrefix}eval[1] = 2+3`);
            await session['onSuspend']();
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '3+4', frameId: 1 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(3).firstArg).to.eql(`if type(${session.tempVarPrefix}eval) = "<uninitialized>" then ${session.tempVarPrefix}eval = []\n`);
            expect(stub.getCall(4).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 3+4`);
        });

        it('can assign to a variable', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);

            const stub = sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
                return Promise.resolve({ type: 'message', message: '' });
            });
            sinon.stub(rokuAdapter, 'getVariable').callsFake(x => {
                return Promise.resolve({
                    evaluateName: x,
                    highLevelType: 'primative',
                    value: '1'
                } as EvaluateContainer);
            });
            rokuAdapter.isAtDebuggerPrompt = true;
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: 'testVar = "foo"', frameId: 1 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(0).firstArg).to.eql('testVar = "foo"');
        });

        it('handels evaluating expressions on different threads', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);

            const stub = sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
                return Promise.resolve({ type: 'message', message: '' });
            });
            sinon.stub(rokuAdapter, 'getVariable').callsFake(x => {
                return Promise.resolve({
                    evaluateName: x,
                    highLevelType: 'primative',
                    value: '1'
                } as EvaluateContainer);
            });
            rokuAdapter.isAtDebuggerPrompt = true;
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '1+2', frameId: 1 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(0).firstArg).to.eql(`if type(${session.tempVarPrefix}eval) = "<uninitialized>" then ${session.tempVarPrefix}eval = []\n`);
            expect(stub.getCall(1).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 1+2`);
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '2+3', frameId: 2 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(2).firstArg).to.eql(`if type(${session.tempVarPrefix}eval) = "<uninitialized>" then ${session.tempVarPrefix}eval = []\n`);
            expect(stub.getCall(3).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 2+3`);
        });
    });

    describe('variablesRequest', () => {
        it('hides debug local variables', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);

            sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
                return Promise.resolve({ type: 'message', message: '' });
            });
            sinon.stub(rokuAdapter, 'getScopeVariables').callsFake(() => {
                return Promise.resolve(['m', 'top', `${session.tempVarPrefix}eval`]);
            });
            sinon.stub(session as any, 'populateScopeVariables').callsFake((v: AugmentedVariable, args: DebugProtocol.VariablesArguments) => {
                v.childVariables = [{
                    name: `${session.tempVarPrefix}eval`,
                    value: 'true',
                    variablesReference: 0
                }, {
                    name: 'top',
                    value: 'roSGNode:GetSubReddit',
                    variablesReference: 3
                }, {
                    name: 'm',
                    value: VariableType.AssociativeArray,
                    variablesReference: 0
                }];
            });
            sinon.stub(rokuAdapter, 'getVariable').callsFake(x => {
                return Promise.resolve(
                    {
                        name: x,
                        highLevelType: 'primative',
                        value: '1'
                    } as EvaluateContainer);
            });

            let response: DebugProtocol.VariablesResponse = {
                body: {
                    variables: []
                },
                request_seq: 0,
                success: false,
                command: '',
                seq: 0,
                type: ''
            };

            rokuAdapter.isAtDebuggerPrompt = true;
            session['launchConfiguration'].enableVariablesPanel = true;
            session['dispatchRequest']({ command: 'scopes', arguments: { frameId: 0 }, type: 'request', seq: 8 });
            await session.variablesRequest(
                response,
                { variablesReference: 1, filter: 'named', start: 0, count: 0, format: '' } as DebugProtocol.VariablesArguments
            );

            expect(
                response.body.variables.find(x => x.name.startsWith(session.tempVarPrefix))
            ).to.not.exist;

            session['launchConfiguration'].showHiddenVariables = true;
            await session.variablesRequest(
                response,
                { variablesReference: 1, filter: 'named', start: 0, count: 0, format: '' } as DebugProtocol.VariablesArguments
            );
            expect(
                response.body.variables.find(x => x.name.startsWith(session.tempVarPrefix))
            ).to.exist;
        });

        it('hides debug children variables', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);

            sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
                return Promise.resolve({ type: 'message', message: '' });
            });

            rokuAdapter.isAtDebuggerPrompt = true;

            let response: DebugProtocol.VariablesResponse = {
                body: {
                    variables: []
                },
                request_seq: 0,
                success: false,
                command: '',
                seq: 0,
                type: ''
            };
            //Set the this.variables
            session['variables'][1001] = {
                name: 'm',
                value: 'roAssociativeArray',
                variablesReference: 1,
                childVariables: [
                    {
                        name: '__rokudebug__eval',
                        value: 'true',
                        variablesReference: 0
                    },
                    {
                        name: 'top',
                        value: 'roSGNode:GetSubReddit',
                        variablesReference: 3
                    },
                    {
                        name: '$count',
                        value: '3',
                        variablesReference: 0
                    }
                ]
            };

            await session.variablesRequest(
                response,
                { variablesReference: 1001, filter: 'named', start: 0, count: 0, format: '' } as DebugProtocol.VariablesArguments
            );

            expect(
                response.body.variables.find(x => x.name.startsWith(session.tempVarPrefix))
            ).to.not.exist;

            session['launchConfiguration'].showHiddenVariables = true;
            await session.variablesRequest(
                response,
                { variablesReference: 1001, filter: 'named', start: 0, count: 0, format: '' } as DebugProtocol.VariablesArguments
            );
            expect(
                response.body.variables.find(x => x.name.startsWith(session.tempVarPrefix))
            ).to.exist;
        });
    });

    describe('start', () => {
        let setupStub: sinonActual.SinonStub;

        beforeEach(() => {
            setupStub = sinon.stub(dapLogger, 'setup');
            // stub the base class start() so we don't need real streams
            sinon.stub(DebugSession.prototype, 'start').returns(undefined);
            // stub so process error handlers aren't registered for real during tests
            // (those are covered by logging.spec.ts)
            sinon.stub(session, 'setupProcessErrorHandlers');
        });

        it('does not configure DAP logging when ROKU_DAP_LOG_FILE is not set', () => {
            delete process.env.ROKU_DAP_LOG_FILE;
            session.start(null as any, null as any);
            expect(setupStub.called).to.be.false;
        });

        it('calls dapLogger.setup with the env var path when ROKU_DAP_LOG_FILE is set', () => {
            process.env.ROKU_DAP_LOG_FILE = '/tmp/test-dap.log';
            try {
                session.start(null as any, null as any);
                expect(setupStub.calledOnce).to.be.true;
                expect(setupStub.firstCall.args[0]).to.equal(DapLogger.LogLevel.Error);
                expect(setupStub.firstCall.args[1]).to.equal('/tmp/test-dap.log');
            } finally {
                delete process.env.ROKU_DAP_LOG_FILE;
            }
        });
    });

    describe('setupProcessErrorHandlers', () => {
        let sendEventStub: sinonActual.SinonStub;
        let shutdownStub: sinonActual.SinonStub;

        beforeEach(() => {
            sendEventStub = sinon.stub(session, 'sendEvent');
            shutdownStub = sinon.stub(session, 'shutdown').resolves();
            session['processErrorHandlersRegistered'] = false;
        });

        afterEach(() => {
            session.teardownProcessErrorHandlers();
        });

        it('registers handlers only once even when called multiple times', () => {
            const onSpy = sinon.spy(process, 'on');
            session.setupProcessErrorHandlers();
            session.setupProcessErrorHandlers();
            expect(onSpy.withArgs('uncaughtException').callCount).to.equal(1);
        });

        it('sends ProcessCrashEvent for uncaughtException', () => {
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](new Error('test crash'));
            expect(sendEventStub.calledOnce).to.be.true;
            const event = sendEventStub.firstCall.args[0];
            expect(isProcessCrashEvent(event)).to.be.true;
            expect(event.body.type).to.equal('uncaughtException');
            expect(event.body.message).to.equal('test crash');
        });

        it('sends ProcessCrashEvent for unhandledRejection', () => {
            session.setupProcessErrorHandlers();
            session['_unhandledRejectionHandler'](new Error('rejected'));
            expect(sendEventStub.calledOnce).to.be.true;
            const event = sendEventStub.firstCall.args[0];
            expect(isProcessCrashEvent(event)).to.be.true;
            expect(event.body.type).to.equal('unhandledRejection');
            expect(event.body.message).to.equal('rejected');
        });

        it('includes error stack in ProcessCrashEvent', () => {
            const error = new Error('test crash');
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](error);
            const event = sendEventStub.firstCall.args[0];
            expect(event.body.stack).to.equal(error.stack);
        });

        it('sets isCrashed to true', () => {
            expect(session['isCrashed']).to.be.false;
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](new Error('boom'));
            expect(session['isCrashed']).to.be.true;
        });

        it('handles non-Error thrown values', () => {
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler']('string error' as any);
            const event = sendEventStub.firstCall.args[0];
            expect(event.body.message).to.equal('string error');
            expect(event.body.stack).to.be.undefined;
        });

        it('calls sendLogOutput with formatted crash output', () => {
            const sendLogOutputStub = sinon.stub(session as any, 'sendLogOutput').resolves();
            const error = new Error('boom');
            error.stack = 'Error: boom\n    at test:1:1';
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](error);
            expect(sendLogOutputStub.calledOnce).to.be.true;
            const output: string = sendLogOutputStub.firstCall.args[0];
            expect(output).to.include('BRIGHTSCRIPT DEBUGGER INTERNAL ERROR');
            expect(output).to.include('uncaughtException');
            expect(output).to.include('boom');
            expect(output).to.include('https://github.com/RokuCommunity/roku-debug/issues/new');
        });

        it('includes client name from initRequestArgs in output', () => {
            session['initRequestArgs'] = { clientName: 'VS Code', clientID: 'vscode' } as any;
            const sendLogOutputStub = sinon.stub(session as any, 'sendLogOutput').resolves();
            const error = new Error('boom');
            error.stack = 'Error: boom\n    at test:1:1';
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](error);
            const output: string = sendLogOutputStub.firstCall.args[0];
            expect(output).to.include('**Client Name:** "VS Code"');
        });

        it('uses "unknown" for client name when initRequestArgs is not set', () => {
            session['initRequestArgs'] = undefined;
            const sendLogOutputStub = sinon.stub(session as any, 'sendLogOutput').resolves();
            const error = new Error('boom');
            error.stack = 'Error: boom\n    at test:1:1';
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](error);
            const output: string = sendLogOutputStub.firstCall.args[0];
            expect(output).to.include('**Client Name:** "unknown"');
        });

        it('includes additionalInfo fields in ProcessCrashEvent body', () => {
            session['initRequestArgs'] = { clientName: 'VS Code', clientID: 'vscode' } as any;
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](new Error('boom'));
            const event = sendEventStub.firstCall.args[0];
            expect(isProcessCrashEvent(event)).to.be.true;
            expect(event.body.additionalInfo).to.exist;
            expect(event.body.additionalInfo.clientName).to.equal('VS Code');
            expect(event.body.additionalInfo.rokuDebugVersion).to.be.a('string');
        });

        it('uses "(no stack trace)" in output when error has no stack', () => {
            const sendLogOutputStub = sinon.stub(session as any, 'sendLogOutput').resolves();
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler']('not an error' as any);
            const output: string = sendLogOutputStub.firstCall.args[0];
            expect(output).to.include('(no stack trace)');
        });

        it('truncates a very long stack trace in the issue URL', () => {
            const sendLogOutputStub = sinon.stub(session as any, 'sendLogOutput').resolves();
            const longStack = 'x'.repeat(3000);
            const error = new Error('boom');
            error.stack = longStack;
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](error);
            const output: string = sendLogOutputStub.firstCall.args[0];
            expect(output).to.include('...(truncated)');
        });

        it('falls back to JSON output when readJsonSync throws', () => {
            sinon.stub(fsExtra, 'readJsonSync').throws(new Error('file not found'));
            const sendLogOutputStub = sinon.stub(session as any, 'sendLogOutput').resolves();
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](new Error('boom'));
            const output: string = sendLogOutputStub.firstCall.args[0];
            // fallback is JSON-stringified error from catch block
            expect(output).to.include('file not found');
        });

        it('schedules shutdown() after 5 seconds on uncaughtException', () => {
            const clock = sinon.useFakeTimers();
            session.setupProcessErrorHandlers();
            session['_uncaughtExceptionHandler'](new Error('boom'));
            expect(shutdownStub.called).to.be.false;
            clock.tick(5000);
            expect(shutdownStub.calledOnce).to.be.true;
            clock.restore();
        });

        it('schedules shutdown() after 5 seconds on unhandledRejection', () => {
            const clock = sinon.useFakeTimers();
            session.setupProcessErrorHandlers();
            session['_unhandledRejectionHandler'](new Error('rejected'));
            expect(shutdownStub.called).to.be.false;
            clock.tick(5000);
            expect(shutdownStub.calledOnce).to.be.true;
            clock.restore();
        });
    });

    describe('initializeRequest', () => {
        it('does not throw', () => {
            assert.doesNotThrow(() => {
                session.initializeRequest({} as DebugProtocol.InitializeResponse, {} as DebugProtocol.InitializeRequestArguments);
            });
        });
    });

    describe('setExceptionBreakpoints', () => {
        let response;
        let args;
        beforeEach(() => {
            response = {
                seq: 0,
                type: 'response',
                request_seq: 3,
                command: 'setExceptionBreakpoints',
                success: true
            };
            args = {
                filters: undefined,
                filterOptions: undefined
            };
            //the request now waits on `rokuAdapterDeferred` directly (instead of `getRokuAdapter`),
            //so resolve it up front for these tests
            session['rokuAdapterDeferred'].resolve(rokuAdapter as any);
        });

        it('both caught and uncaught filters', async () => {
            args.filters = ['caught', 'uncaught'];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([
                { filter: 'caught' },
                { filter: 'uncaught' }
            ]);
        });

        it('handles devices that do not support exception breakpoints', async () => {
            args.filters = ['caught', 'uncaught'];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = false;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: false },
                { verified: false }
            ]);
        });

        it('set uncaught filters', async () => {
            args.filters = ['uncaught'];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([
                { filter: 'uncaught' }
            ]);
        });

        it('set caught filter', async () => {
            args.filters = ['caught'];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([
                { filter: 'caught' }
            ]);
        });

        it('set zero filters', async () => {
            args.filters = [];
            args.filterOptions = [];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([]);
        });

        it('set filters with bad values', async () => {
            args.filters = ['garbage'];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([
                { filter: 'garbage' }
            ]);
        });

        it('fails to set filters', async () => {
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake((filters) => {
                throw new Error('error');
            });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: false },
                { verified: false }
            ]);
        });

        it('sets filters with conditions', async () => {
            args.filterOptions = [{ filterId: 'caught', condition: 'a > 1' }];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);

            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([
                {
                    filter: 'caught',
                    conditionExpression: 'a > 1'
                }
            ]);
        });

        it('resets filters when the app closes', async () => {
            args.filters = ['caught', 'uncaught'];
            sinon.stub(session, 'getRokuAdapter' as keyof BrightScriptDebugSession).callsFake(async () => { });
            const stub = sinon.stub(rokuAdapter, 'setExceptionBreakpoints').callsFake(async (filters) => { });
            rokuAdapter.supportsExceptionBreakpoints = true;

            await session['setExceptionBreakPointsRequest'](response, args);
            expect(response.body.breakpoints).to.eql([
                { verified: true },
                { verified: true }
            ]);
            expect(stub.firstCall.args[0]).to.eql([
                { filter: 'caught' },
                { filter: 'uncaught' }
            ]);
            expect(session['exceptionBreakpoints']).to.eql([
                { filter: 'caught' },
                { filter: 'uncaught' }
            ]);
        });
    });

    describe('evaluating variable', () => {
        let getVariableValue;

        beforeEach(() => {
            rokuAdapter.getVariable = () => {
                return Promise.resolve(getVariableValue);
            };
        });

        function getResponse<T>(index: number) {
            let deferred = defer();
            (deferred as any).index = index;
            if (responses[index]) {
                deferred.resolve(responses[index]);
            } else {
                //do nothing, it will get resolved later
            }
            responseDeferreds.push(deferred);
            return deferred.promise as Promise<T>;
        }

        function getBooleanEvaluateContainer(expression: string, name: string = null) {
            return <EvaluateContainer>{
                name: name || expression,
                evaluateName: expression,
                type: PrimativeType.boolean,
                value: 'true',
                highLevelType: HighLevelType.primative,
                children: null
            };
        }

        it('returns the correct boolean variable', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);
            sinon.stub(session['rokuAdapter'], 'isTelnetAdapter').callsFake(() => true);
            sinon.stub(session['rokuAdapter'], 'isDebugProtocolAdapter').callsFake(() => false);

            let expression = 'someBool';
            getVariableValue = getBooleanEvaluateContainer(expression);
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            void session.evaluateRequest({} as DebugProtocol.EvaluateResponse, { context: 'hover', expression: expression } as DebugProtocol.EvaluateArguments);
            let response = await getResponse<DebugProtocol.EvaluateResponse>(0);
            expect(response.body).to.eql({
                result: 'true',
                type: 'Boolean',
                variablesReference: 0,
                namedVariables: 0,
                indexedVariables: 0
            });
        });

        //this fails on TravisCI for some reason. TODO - fix this
        it('returns the correct indexed variables count', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);
            sinon.stub(session['rokuAdapter'], 'isTelnetAdapter').callsFake(() => true);
            sinon.stub(session['rokuAdapter'], 'isDebugProtocolAdapter').callsFake(() => false);

            let expression = 'someArray';
            getVariableValue = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: 'roArray',
                value: 'roArray',
                highLevelType: HighLevelType.array,
                //shouldn't actually process the children
                children: [getBooleanEvaluateContainer('someArray[0]', '0'), getBooleanEvaluateContainer('someArray[1]', '1')]
            };
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            void session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            let response = await getResponse<DebugProtocol.EvaluateResponse>(0);
            expect(response.body).to.eql({
                result: 'roArray',
                type: 'roArray',
                variablesReference: 1,
                namedVariables: 0,
                indexedVariables: 2
            });
        });

        it('returns the correct named variables count', async () => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);
            sinon.stub(session['rokuAdapter'], 'isTelnetAdapter').callsFake(() => true);
            sinon.stub(session['rokuAdapter'], 'isDebugProtocolAdapter').callsFake(() => false);

            let expression = 'someObject';
            getVariableValue = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: 'roAssociativeArray',
                value: 'roAssociativeArray',
                highLevelType: HighLevelType.object,
                //shouldn't actually process the children
                children: [getBooleanEvaluateContainer('someObject.isAlive', 'true'), getBooleanEvaluateContainer('someObject.ownsHouse', 'false')]
            };
            sinon.stub(rokuAdapter, 'isScrapableContainObject').returns(true);

            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            void session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            let response = await getResponse<DebugProtocol.EvaluateResponse>(0);
            expect(response.body).to.eql({
                result: 'roAssociativeArray',
                type: 'roAssociativeArray',
                variablesReference: 1,
                namedVariables: 2,
                indexedVariables: 0
            });
        });

        it.skip('allows retrieval of children', async () => {
            let expression = 'someObject';
            getVariableValue = <EvaluateContainer>{
                name: expression,
                evaluateName: expression,
                type: 'roAssociativeArray',
                value: 'roAssociativeArray',
                highLevelType: HighLevelType.object,
                //shouldn't actually process the children
                children: [getBooleanEvaluateContainer('someObject.isAlive', 'isAlive'), getBooleanEvaluateContainer('someObject.ownsHouse', 'ownsHouse')]
            };
            //adapter has to be at prompt for evaluates to work
            rokuAdapter.isAtDebuggerPrompt = true;
            void session.evaluateRequest(<any>{}, { context: 'hover', expression: expression });
            /*let response = <DebugProtocol.EvaluateResponse>*/
            await getResponse(0);

            //get variables
            void session.variablesRequest(<any>{}, { variablesReference: 1 });
            let childVars = await getResponse<DebugProtocol.VariablesResponse>(1);
            assert.deepEqual(childVars.body.variables, [
                {
                    name: 'isAlive',
                    value: 'true',
                    variablesReference: 2,
                    evaluateName: 'someObject.isAlive'
                }, {
                    name: 'ownsHouse',
                    value: 'true',
                    variablesReference: 3,
                    evaluateName: 'someObject.ownsHouse'
                }
            ]);
        });
    });

    describe('findMainFunction', () => {
        let folder;
        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        async function doTest(fileContents: string, lineContents: string, lineNumber: number) {
            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            let filePath = path.resolve(`${folder}/main.brs`);

            //prevent actually talking to the file system...just hardcode the list to exactly our main file
            (session.rokuDeploy as any).getFilePaths = () => {
                return [{
                    src: filePath,
                    dest: filePath
                }];
            };

            fsExtra.writeFileSync(filePath, fileContents);
            (session as any).launchConfiguration = {
                files: [
                    folder + '/**/*'
                ]
            };
            let entryPoint = await fileUtils.findEntryPoint(folder);
            expect(entryPoint.pathAbsolute).to.equal(filePath);
            expect(entryPoint.lineNumber).to.equal(lineNumber);
            expect(entryPoint.contents).to.equal(lineContents);
        }

        it('works for RunUserInterface', async () => {
            await doTest('\nsub RunUserInterface()\nend sub', 'sub RunUserInterface()', 2);
            //works with args
            await doTest('\n\nsub RunUserInterface(args as Dynamic)\nend sub', 'sub RunUserInterface(args as Dynamic)', 3);
            //works with extra spacing
            await doTest('\n\nsub   RunUserInterface()\nend sub', 'sub   RunUserInterface()', 3);
            await doTest('\n\nsub RunUserInterface   ()\nend sub', 'sub RunUserInterface   ()', 3);
        });

        it('works for sub main', async () => {
            await doTest('\nsub Main()\nend sub', 'sub Main()', 2);
            //works with args
            await doTest('sub Main(args as Dynamic)\nend sub', 'sub Main(args as Dynamic)', 1);
            //works with extra spacing
            await doTest('sub   Main()\nend sub', 'sub   Main()', 1);
            await doTest('sub Main   ()\nend sub', 'sub Main   ()', 1);
        });

        it('works for function main', async () => {
            await doTest('function Main()\nend function', 'function Main()', 1);
            await doTest('function Main(args as Dynamic)\nend function', 'function Main(args as Dynamic)', 1);
            //works with extra spacing
            await doTest('function   Main()\nend function', 'function   Main()', 1);
            await doTest('function Main   ()\nend function', 'function Main   ()', 1);
        });

        it('works for sub RunScreenSaver', async () => {
            await doTest('sub RunScreenSaver()\nend sub', 'sub RunScreenSaver()', 1);
            //works with extra spacing
            await doTest('sub   RunScreenSaver()\nend sub', 'sub   RunScreenSaver()', 1);
            await doTest('sub RunScreenSaver   ()\nend sub', 'sub RunScreenSaver   ()', 1);
        });

        it('works for function RunScreenSaver', async () => {
            await doTest('function RunScreenSaver()\nend function', 'function RunScreenSaver()', 1);
            //works with extra spacing
            await doTest('function   RunScreenSaver()\nend function', 'function   RunScreenSaver()', 1);
            await doTest('function RunScreenSaver   ()\nend function', 'function RunScreenSaver   ()', 1);
        });
    });

    describe('initRendezvousTracking', () => {
        it('clears history when disabled', async () => {
            const stub = sinon.stub(session, 'sendEvent');
            const activateStub = sinon.stub(RendezvousTracker.prototype, 'activate');
            const clearHistoryStub = sinon.stub(RendezvousTracker.prototype, 'clearHistory');

            session['launchConfiguration'].rendezvousTracking = false;

            await session['initRendezvousTracking']();
            expect(clearHistoryStub.called).to.be.true;
            expect(activateStub.called).to.be.false;
        });

        it('activates when not disabled', async () => {
            const stub = sinon.stub(session, 'sendEvent');
            const activateStub = sinon.stub(RendezvousTracker.prototype, 'activate');
            const clearHistoryStub = sinon.stub(RendezvousTracker.prototype, 'clearHistory');

            session['launchConfiguration'].rendezvousTracking = undefined;

            await session['initRendezvousTracking']();
            expect(clearHistoryStub.called).to.be.true;
            expect(activateStub.called).to.be.true;

        });
    });

    describe('setBreakPointsRequest', () => {
        let response;
        let args: DebugProtocol.SetBreakpointsArguments;
        beforeEach(() => {
            response = undefined;
            //intercept the sent response
            session.sendResponse = (res) => {
                response = res;
            };

            args = {
                source: {
                    path: s`${rootDir}/dest/some/file.brs`
                },
                breakpoints: []
            };
        });

        it('returns correct results', async () => {
            args.source.path = s`${rootDir}/source/main.brs`;

            fsExtra.outputFileSync(s`${rootDir}/manifest`, '');
            fsExtra.outputFileSync(s`${rootDir}/source/main.brs`, 'sub main()\nend sub');
            args.breakpoints = [{ line: 1 }];
            await session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints[0]).to.deep.include({
                line: 1,
                verified: false
            });

            //simulate "launch" — stage in launchRequest, then write breakpoints + zip in configurationDoneRequest
            await session.prepareMainProject();
            await session['writeMainProjectBreakpoints']();
            await session['zipMainProject']();

            //remove the breakpoint
            args.breakpoints = [];
            await session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.be.lengthOf(0);

            //add breakpoint during live debug session. one was there before, the other is new.
            //line 1 was already staged so it comes back verified; line 2 is new so it is not.
            args.breakpoints = [{ line: 1 }, { line: 2 }];
            await session.setBreakPointsRequest(<any>{}, args);
            expect(
                response.body.breakpoints.map(x => ({ line: x.line, verified: x.verified }))
            ).to.eql([{
                line: 1,
                verified: true
            }, {
                line: 2,
                verified: false
            }]);
        });

        it('supports breakpoints within xml files', async () => {
            args.source.path = `${rootDir}/some/xml-file.xml`;
            args.breakpoints = [{ line: 1 }];
            await session.setBreakPointsRequest(<any>{}, args);
            //breakpoint should be unverified by default
            expect(response.body.breakpoints[0]).to.deep.include({
                line: 1,
                verified: false
            });
        });

        it('handles breakpoints for non-brightscript files', async () => {
            args.source.path = `${rootDir}/some/xml-file.jpg`;
            args.breakpoints = [{ line: 1 }];
            await session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.be.lengthOf(1);
            //breakpoint should be disabled
            expect(response.body.breakpoints[0]).to.deep.include({ line: 1, verified: false });
        });
    });

    describe('handleEntryBreakpoint', () => {
        it('registers the entry breakpoint when stopOnEntry is enabled', async () => {
            (session as any).launchConfiguration = { stopOnEntry: true };
            session.projectManager.mainProject = <any>{
                stagingDir: stagingDir
            };
            let stub = sinon.stub(session.projectManager, 'registerEntryBreakpoint').returns(Promise.resolve());
            await session.handleEntryBreakpoint();
            expect(stub.called).to.be.true;
            expect(stub.args[0][0]).to.equal(stagingDir);
        });
        it('does NOT register the entry breakpoint when stopOnEntry is enabled', async () => {
            (session as any).launchConfiguration = { stopOnEntry: false };
            let stub = sinon.stub(session.projectManager, 'registerEntryBreakpoint').returns(Promise.resolve());
            await session.handleEntryBreakpoint();
            expect(stub.called).to.be.false;
        });
    });

    describe('resetSessionState', () => {
        it('resets the breakpoint manager so a restart does not reuse stale staged data', () => {
            const reset = sinon.stub(session.breakpointManager, 'reset');

            (session as any).resetSessionState();

            expect(reset.calledOnce, 'breakpointManager.reset() should be called').to.be.true;
        });
    });

    describe('shutdown', () => {
        it('erases all staging folders when configured to do so', async () => {
            let stub = sinon.stub(fsExtra, 'removeSync').returns(null);
            session.projectManager.mainProject = <any>{
                stagingDir: 'stagingPathA'
            };
            session.projectManager.componentLibraryProjects.push(<any>{
                stagingDir: 'stagingPathB'
            });
            (session as any).launchConfiguration = {
                retainStagingFolder: false
            };

            await session.shutdown();
            expect(stub.callCount).to.equal(2);
            expect(stub.args.map(x => x[0])).to.eql([
                'stagingPathA',
                'stagingPathB'
            ]);
        });

        it('ends an active launch progress bar when shutdown is called mid-launch', async () => {
            const clock = sinon.useFakeTimers();
            const events = [];
            sinon.stub(session, 'sendEvent').callsFake((event) => events.push(event));

            // Simulate a progress bar that was opened before shutdown was called
            session['initRequestArgs'].supportsProgressReporting = true;
            session['launchProgressId'] = 'mid-launch-progress';

            const shutdownPromise = session.shutdown();
            await clock.tickAsync(2000);
            await shutdownPromise;

            const progressEndEvents = events.filter(e => e instanceof ProgressEndEvent);
            expect(progressEndEvents).to.have.lengthOf(1);
            expect(progressEndEvents[0].body.progressId).to.equal('mid-launch-progress');
        });

        it('does not send ProgressEndEvent when no launch progress is active', async () => {
            const events = [];
            sinon.stub(session, 'sendEvent').callsFake((event) => events.push(event));

            session['initRequestArgs'].supportsProgressReporting = true;
            expect(session['launchProgressId']).to.be.undefined;

            await session.shutdown();

            expect(events.filter(e => e instanceof ProgressEndEvent)).to.be.empty;
        });
    });

    describe('disconnectRequest', () => {
        //Regression tests for DAP crashes from unhandled pressHomeButton rejections at disconnect time:
        //  - https://github.com/rokucommunity/vscode-brightscript-language/issues/807 (EHOSTDOWN)
        //  - https://github.com/rokucommunity/roku-debug/issues/332 (ECONNREFUSED)
        //@vscode/debugadapter dispatches disconnectRequest without awaiting the returned Promise
        //(debugSession.js:391), so any rejection from `await this.rokuDeploy.pressHomeButton(...)`
        //becomes an unhandled rejection that crashes the DAP process. When the device is powered
        //off / unreachable at disconnect time, the ECP connect attempt fails — the specific Node
        //error code depends on the OS-level reason (host unresponsive vs. connection refused).
        function makeTelnetDisconnectSession(rejection: Error) {
            (session as any).launchConfiguration = {
                ...launchConfiguration,
                enableDebugProtocol: false,
                host: '192.168.1.17',
                remotePort: 8060
            };
            session.rokuDeploy.pressHomeButton = () => Promise.reject(rejection);
            //stub shutdown so the test doesn't tear down the whole session machinery
            sinon.stub(session, 'shutdown').resolves();
        }

        it('does not reject when pressHomeButton fails with EHOSTDOWN (telnet adapter)', async () => {
            makeTelnetDisconnectSession(
                Object.assign(new Error('connect EHOSTDOWN 192.168.1.17:8060 - Local (192.168.1.18:51783)'), { code: 'EHOSTDOWN' })
            );
            await session['disconnectRequest']({} as DebugProtocol.DisconnectResponse, {} as DebugProtocol.DisconnectArguments);
        });

        it('does not reject when pressHomeButton fails with ECONNREFUSED (telnet adapter)', async () => {
            makeTelnetDisconnectSession(
                Object.assign(new Error('connect ECONNREFUSED 192.168.1.17:8060'), { code: 'ECONNREFUSED' })
            );
            await session['disconnectRequest']({} as DebugProtocol.DisconnectResponse, {} as DebugProtocol.DisconnectArguments);
        });
    });

    describe('handleDiagnostics', () => {
        it('ends launch progress when a compile error diagnostic is received', async () => {
            const clock = sinon.useFakeTimers();
            sinon.stub(session.projectManager, 'getSourceLocation').resolves(undefined);

            const events: any[] = [];
            sinon.stub(session, 'sendEvent').callsFake((event) => events.push(event));
            session['initRequestArgs'].supportsProgressReporting = true;
            session['sendLaunchProgress']('start', 'Waiting on application');

            await session['handleDiagnostics']([{
                message: 'Syntax error',
                path: 'SomeComponent.xml',
                range: bscUtil.createRange(1, 2, 3, 4),
                severity: DiagnosticSeverity.Error
            }]);

            // sendLaunchProgress('end') immediately emits a ProgressUpdateEvent, then ProgressEndEvent after delay
            const updateEvent = events.find(e => e instanceof ProgressUpdateEvent);
            expect(updateEvent).to.exist;
            expect((updateEvent.body as any).message).to.equal('Aborted (compile error)');
            expect(session['launchProgressId']).to.be.undefined;

            clock.tick(1100);
            const endEvent = events.find(e => e instanceof ProgressEndEvent);
            expect(endEvent).to.exist;
        });

        it('finds source location for file-only path', async () => {
            session['rokuAdapter'] = { destroy: () => { } } as any;
            session.projectManager.mainProject = new Project({
                rootDir: rootDir,
                outDir: stagingDir
            } as Partial<AddProjectParams> as any);
            session.projectManager['mainProject'].fileMappings = [];

            fsExtra.outputFileSync(`${stagingDir}/.roku-deploy-staging/components/SomeComponent.xml`, '');
            fsExtra.outputFileSync(`${rootDir}/components/SomeComponent.xml`, '');

            const stub = sinon.stub(session, 'sendEvent').callsFake(() => { });
            await session['handleDiagnostics']([{
                message: 'Crash',
                path: 'SomeComponent.xml',
                range: bscUtil.createRange(1, 2, 3, 4),
                severity: DiagnosticSeverity.Warning
            }]);
            expect(stub.getCall(0).args[0]?.body).to.eql({
                diagnostics: [{
                    message: 'Crash',
                    path: s`${stagingDir}/.roku-deploy-staging/components/SomeComponent.xml`,
                    range: bscUtil.createRange(1, 2, 1, 4),
                    severity: DiagnosticSeverity.Warning,
                    source: 'roku-debug'
                }]
            });
        });
    });

    describe('evaluateRequest', () => {
        const frameId = 12;
        let evalStub: SinonStub;
        let getVarStub: SinonStub;
        let getVarValue = {
            evaluateName: '',
            highLevelType: 'primative',
            value: '"alpha"'
        } as EvaluateContainer;

        beforeEach(() => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);
            sinon.stub(session['rokuAdapter'], 'isTelnetAdapter').callsFake(() => true);
            sinon.stub(session['rokuAdapter'], 'isDebugProtocolAdapter').callsFake(() => false);

            rokuAdapter.isAtDebuggerPrompt = true;
            evalStub = sinon.stub(rokuAdapter, 'evaluate').callsFake((args) => {
                console.log('called with', args);
                return Promise.resolve({
                    message: undefined,
                    type: 'message'
                });
            });
            getVarStub = sinon.stub(rokuAdapter, 'getVariable').callsFake(() => {
                return Promise.resolve(getVarValue);
            });
        });

        async function expectResponse(args: DebugProtocol.EvaluateArguments, responseBody: DebugProtocol.EvaluateResponse['body']) {
            const result = await session.evaluateRequest({} as any, {
                frameId: frameId,
                ...args
            });
            expect(responses[0]?.body).to.eql(responseBody);
            return result;
        }

        it('ensures closing quote for hover', async () => {
            initRequestArgs.supportsInvalidatedEvent = true;
            const result = await session.evaluateRequest({} as any, {
                frameId: frameId,
                expression: `"Billy`,
                context: 'hover'
            });
            console.log('checking calls');
            expect(
                evalStub.getCalls().find(x => x.args.find(x => x?.toString().includes('"Billy"')))
            ).to.exist;
        });

        it('skips when not at debugger prompt', async () => {
            rokuAdapter.isAtDebuggerPrompt = false;
            await expectResponse({
                context: 'repl',
                expression: 'print "hello"'
            }, {
                result: 'invalid',
                variablesReference: 0
            });
        });

        it('caches results', async () => {
            const refId = session['getEvaluateRefId']('person.name', frameId);
            session['variables'][refId] = {
                name: 'person.name',
                variablesReference: 0,
                value: 'someValue'
            };
            await expectResponse({
                context: 'repl',
                expression: 'person.name'
            }, {
                result: 'someValue',
                variablesReference: 0,
                type: undefined,
                indexedVariables: 0,
                namedVariables: 0
            });
        });

        it('clears cache on evaluate call', async () => {
            const refId = session['getEvaluateRefId']('person.name', frameId);
            session['variables'][refId] = {
                name: 'person.name',
                variablesReference: 0,
                value: 'someValue'
            };
            await expectResponse({
                context: 'repl',
                expression: 'print person.name'
            }, {
                result: 'invalid',
                variablesReference: 0
            });
            expect(session['variables']).to.be.empty;
        });

        describe('stackTraceRequest', () => {
            it('gracefully handles missing files', async () => {
                session.projectManager.mainProject = new Project({
                    rootDir: rootDir,
                    outDir: stagingDir
                } as Partial<AddProjectParams> as any);
                session.projectManager['mainProject'].fileMappings = [];

                session.projectManager.componentLibraryProjects.push(
                    new ComponentLibraryProject({
                        rootDir: complib1Dir,
                        stagingDir: stagingDir,
                        outDir: outDir,
                        libraryIndex: 1
                    } as Partial<ComponentLibraryConstructorParams> as any)
                );
                session.projectManager['componentLibraryProjects'][0].fileMappings = [];

                sinon.stub(rokuAdapter, 'getStackTrace').returns(Promise.resolve([{
                    filePath: 'customComplib:/source/lib/AdManager__lib1.brs',
                    lineNumber: 500,
                    functionIdentifier: 'doSomething'
                }, {
                    filePath: 'roku_ads_lib:/libsource/Roku_Ads.brs',
                    lineNumber: 400,
                    functionIdentifier: 'roku_ads__showads'
                }, {
                    filePath: 'pkg:/source/main.brs',
                    lineNumber: 10,
                    functionIdentifier: 'main'
                }] as StackFrame[]));
                await session['stackTraceRequest']({} as any, { threadId: 1 });
                expect(errorSpy.getCalls()[0]?.args ?? []).to.eql([]);
            });
        });

        describe('repl', () => {
            it('calls eval for print statement', async () => {
                await expectResponse({
                    context: 'repl',
                    expression: 'print "hello"'
                }, {
                    result: 'invalid',
                    variablesReference: 0
                });
                expect(evalStub.called).to.be.true;
            });

            it('calls getVariable for var expressions', async () => {
                await expectResponse({
                    context: 'repl',
                    expression: 'person.name'
                }, {
                    result: '"alpha"',
                    variablesReference: 0,
                    indexedVariables: 0,
                    type: undefined,
                    namedVariables: 0
                });
                expect(getVarStub.calledWith('person.name', frameId, true));
            });
        });

        describe('sendLogOutput', () => {

            async function doTest(input: string, output: string, locations: Array<{ filePath: string; lineNumber: number; columnIndex?: number }>) {
                const getSourceLocationStub = sinon.stub(session.projectManager, 'getSourceLocation').callsFake(() => {
                    return Promise.resolve(locations.shift() as any);
                });

                const sendEventStub = sinon.stub(session, 'sendEvent');

                await session['sendLogOutput'](input);

                expect(
                    sendEventStub.getCalls().filter(x => x.args[0] instanceof LogOutputEvent).map(call => call.args[0].body.line).join('')
                ).to.eql(output);
                sendEventStub.restore();
                getSourceLocationStub.restore();
            }

            beforeEach(() => {
                session['launchConfiguration'].rewriteDevicePathsInLogs = true;
            });

            it('modifies pkg locations if found multiline windows', async () => {
                (session as any).isWindowsPlatform = true;
                await doTest(
                    `{
                        backtrace: "
                            file/line: pkg:/components/services/NetworkBase.bs:251
                            Function networkbase_runtaskthread() As Void

                            file/line: pkg:/components/services/Network Base.bs:654
                            Function networkbase_processresponse(message As Object) As Object

                            file/line: pkg:/source/sgnode.bs:109
                            Function sgnode_createnode(nodetype As String, fields As Dynamic) As Object"
                        message: "Divide by Zero."
                        number: 20
                        rethrown: false
                    }`,
                    `{
                        backtrace: "
                            file/line: c:/project/components/services/NetworkBase.bs:260
                            Function networkbase_runtaskthread() As Void

                            file/line: vscode://file/c:/project/components/services/Network%20Base.bs:700
                            Function networkbase_processresponse(message As Object) As Object

                            file/line: c:/project/components/services/sgnode.bs:100
                            Function sgnode_createnode(nodetype As String, fields As Dynamic) As Object"
                        message: "Divide by Zero."
                        number: 20
                        rethrown: false
                    }`,
                    [
                        { filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260 },
                        { filePath: `c:/project/components/services/Network Base.bs`, lineNumber: 700 },
                        { filePath: `c:/project/components/services/sgnode.bs`, lineNumber: 100 }
                    ]
                );
            });

            it('modifies pkg locations if found multiline mac/linx', async () => {
                (session as any).isWindowsPlatform = false;
                await doTest(
                    `{
                        backtrace: "
                            file/line: pkg:/components/services/NetworkBase.bs:251
                            Function networkbase_runtaskthread() As Void

                            file/line: pkg:/components/services/Network Base.bs:654
                            Function networkbase_processresponse(message As Object) As Object

                            file/line: pkg:/source/sgnode.bs:109
                            Function sgnode_createnode(nodetype As String, fields As Dynamic) As Object"
                        message: "Divide by Zero."
                        number: 20
                        rethrown: false
                    }`,
                    `{
                        backtrace: "
                            file/line: /project/components/services/NetworkBase.bs:260
                            Function networkbase_runtaskthread() As Void

                            file/line: file:///project/components/services/Network%20Base.bs:700
                            Function networkbase_processresponse(message As Object) As Object

                            file/line: /project/components/services/sgnode.bs:100
                            Function sgnode_createnode(nodetype As String, fields As Dynamic) As Object"
                        message: "Divide by Zero."
                        number: 20
                        rethrown: false
                    }`,
                    [
                        { filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260 },
                        { filePath: `/project/components/services/Network Base.bs`, lineNumber: 700 },
                        { filePath: `/project/components/services/sgnode.bs`, lineNumber: 100 }
                    ]
                );
            });

            it('modifies windows pkg locations with just line', async () => {
                (session as any).isWindowsPlatform = true;
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs:251`,
                    ` c:/project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs(251)`,
                    ` C:/project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `C:/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs:251`,
                    ` c:/project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs(251)`,
                    ` c:/project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` ...rvices/Network Base.bs(251)`,
                    ` vscode://file/c:/project/components/services/Network%20Base.bs:260`,
                    [{ filePath: `c:/project/components/services/Network Base.bs`, lineNumber: 260 }]
                );
            });

            it('modifies windows pkg locations with line and column', async () => {
                (session as any).isWindowsPlatform = true;
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs:251:10`,
                    ` c:/project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs(251:10)`,
                    ` C:/project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `C:/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs:251:10`,
                    ` c:/project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs(251:10)`,
                    ` c:/project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `c:/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` ...rvices/Network Base.bs(251:10)`,
                    ` vscode://file/c:/project/components/services/Network%20Base.bs:260:12`,
                    [{ filePath: `c:/project/components/services/Network Base.bs`, lineNumber: 260, columnIndex: 11 }]
                );
            });

            it('modifies mac/linx pkg locations with just line', async () => {
                (session as any).isWindowsPlatform = false;
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs:251`,
                    ` /project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs(251)`,
                    ` /project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs:251`,
                    ` /project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs(251)`,
                    ` /project/components/services/NetworkBase.bs:260`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260 }]
                );
                await doTest(
                    ` ...rvices/Network Base.bs(251)`,
                    ` file:///project/components/services/Network%20Base.bs:260`,
                    [{ filePath: `/project/components/services/Network Base.bs`, lineNumber: 260 }]
                );
            });

            it('modifies mac/linx pkg locations line and column', async () => {
                (session as any).isWindowsPlatform = false;
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs:251:10`,
                    ` /project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs(251:10)`,
                    ` /project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs:251:10`,
                    ` /project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` ...rvices/NetworkBase.bs(251:10)`,
                    ` /project/components/services/NetworkBase.bs:260:12`,
                    [{ filePath: `/project/components/services/NetworkBase.bs`, lineNumber: 260, columnIndex: 11 }]
                );
                await doTest(
                    ` ...rvices/Network Base.bs(251:10)`,
                    ` file:///project/components/services/Network%20Base.bs:260:12`,
                    [{ filePath: `/project/components/services/Network Base.bs`, lineNumber: 260, columnIndex: 11 }]
                );
            });

            it('supports device native backtrace object if seen in logs mac file paths', async () => {
                (session as any).isWindowsPlatform = false;
                await doTest(
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "pkg:/source/main.brs"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 9
                    }
                    some other logs`,
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "/project/source/main.brs:20"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 20
                    }
                    some other logs`,
                    [{ filePath: `/project/source/main.brs`, lineNumber: 20 }]
                );
            });

            it('supports device native backtrace object if seen in logs mac file paths with spaces', async () => {
                (session as any).isWindowsPlatform = false;
                await doTest(
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "pkg:/source/main file.brs"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 9
                    }
                    some other logs`,
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "file:///project/source/main%20file.brs:20"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 20
                    }
                    some other logs`,
                    [{ filePath: `/project/source/main file.brs`, lineNumber: 20 }]
                );
            });

            it('supports device native backtrace object if seen in logs windows file paths', async () => {
                (session as any).isWindowsPlatform = true;
                await doTest(
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "pkg:/source/main.brs"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 9
                    }
                    some other logs`,
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "C:/project/source/main.brs:20"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 20
                    }
                    some other logs`,
                    [{ filePath: `C:/project/source/main.brs`, lineNumber: 20 }]
                );
            });

            it('supports device native backtrace object if seen in logs windows file paths with spaces', async () => {
                (session as any).isWindowsPlatform = true;
                await doTest(
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "pkg:/source/main file.brs"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 9
                    }
                    some other logs`,
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "vscode://file/C:/project/source/main%20file.brs:20"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 20
                    }
                    some other logs`,
                    [{ filePath: `C:/project/source/main file.brs`, lineNumber: 20 }]
                );
            });

            it('does not modify path', async () => {
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs`,
                    ` pkg:/components/services/NetworkBase.bs`,
                    [undefined]
                );
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs:251`,
                    ` pkg:/components/services/NetworkBase.bs:251`,
                    [undefined]
                );
                await doTest(
                    ` pkg:/components/services/NetworkBase.bs:251:10`,
                    ` pkg:/components/services/NetworkBase.bs:251:10`,
                    [undefined]
                );
                await doTest(
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "pkg:/source/main.brs"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 9
                    }
                    some other logs`,
                    `some other logs
                    <Component: roAssociativeArray> =
                    {
                        filename: "pkg:/source/main.brs"
                        function: "main(inputarguments As Object) As Void"
                        line_number: 9
                    }
                    some other logs`,
                    [undefined]
                );
            });
        });
    });

    describe('prepareComponentLibraries / packageAndHostComponentLibraries', () => {
        //runs the full complib flow in the same order launchRequest does: stage, then write+postfix,
        //then the cross-project `Library` rewrite, then zip+install+host.
        async function runPrepareAndHost(componentLibraries: any[], port: number) {
            await session['prepareComponentLibraries'](componentLibraries);
            await session['writeAndPostfixComponentLibraries'](componentLibraries);
            await session.projectManager.applyLibraryReferencePostfixes();
            await session['zipAndHostComponentLibraries'](componentLibraries, port);
        }

        function stubDefaults() {
            //deletion now reads the installed list and deletes each one directly; default to a device with nothing installed
            sinon.stub(rokuDeploy as any, 'getInstalledPackages').resolves([]);
            sinon.stub(rokuDeploy, 'deleteComponentLibrary').resolves(null);
            //deletion pauses/resumes compile-error reporting on the adapter
            session['rokuAdapter'] = <any>{
                pauseCompileErrors: sinon.stub().resolves(),
                resumeCompileErrors: sinon.stub().resolves()
            };
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'stage').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').resolves();
            sinon.stub(session.projectManager, 'applyLibraryReferencePostfixes').resolves();
            session['launchConfiguration'].host = '192.168.1.100';
            session['launchConfiguration'].password = 'test123';
            session.projectManager.mainProject = <any>{
                stagingDir: s`${tempDir}/main-staging`,
                zipPackage: sinon.stub().resolves()
            };
        }

        it('installs libraries sequentially when marked install=true', async () => {
            stubDefaults();
            const installOrder = [];
            const publishStub = sinon.stub(rokuDeploy, 'publish').callsFake(async (options) => {
                installOrder.push(options.outFile);
                await util.sleep(10);
                return { message: 'success', results: [] };
            });

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: true }
            ] as any, 8080);

            expect(installOrder).to.eql(['lib1.zip', 'lib2.zip']);
            expect(publishStub.callCount).to.equal(2);
        });

        it('waits for compile-error reporting to fully resume before uploading any zip', async () => {
            stubDefaults();
            const events: string[] = [];
            //resume takes a moment to settle; record when it actually completes
            (session['rokuAdapter'] as any).resumeCompileErrors = sinon.stub().callsFake(async () => {
                await util.sleep(20);
                events.push('resume-complete');
            });
            sinon.stub(rokuDeploy, 'publish').callsFake((options) => {
                events.push(`publish-${options.outFile}`);
                return Promise.resolve({ message: 'success', results: [] });
            });

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true }
            ] as any, 8080);

            //resume must finish settling before the first zip is uploaded
            expect(events).to.eql(['resume-complete', 'publish-lib1.zip']);
        });

        it('skips libraries where install is not true', async () => {
            stubDefaults();
            const installOrder = [];
            const publishStub = sinon.stub(rokuDeploy, 'publish').callsFake(async (options) => {
                installOrder.push(options.outFile);
                await util.sleep(10);
                return { message: 'success', results: [] };
            });

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: false },
                { rootDir: complib1Dir, outFile: 'lib3.zip', install: undefined },
                { rootDir: complib1Dir, outFile: 'lib4.zip', install: null },
                { rootDir: complib1Dir, outFile: 'lib5.zip', install: 1 as any }
            ] as any, 8080);

            expect(publishStub.callCount).to.equal(1);
            expect(installOrder).to.eql(['lib1.zip']);
        });

        it('sends proper form data for installation', async () => {
            stubDefaults();
            const publishStub = sinon.stub(rokuDeploy, 'publish').resolves({ message: 'success', results: [] });

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'testLib.zip', install: true }
            ] as any, 8080);

            expect(publishStub.getCall(0).args[0]).to.include({
                host: '192.168.1.100',
                password: 'test123',
                username: 'rokudev',
                outFile: 'testLib.zip',
                appType: 'dcl'
            });
        });

        it('logs the error AND fails the launch when a library install fails', async () => {
            stubDefaults();
            sinon.stub(rokuDeploy, 'publish').rejects(new Error('Network error'));

            //a failed install must abort the launch (not silently continue with a missing library)
            await expectThrowsAsync(() => runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true }
            ] as any, 8080));

            expect(errorSpy.calledWith('Error installing component library 0 (lib1.zip)')).to.be.true;
        });

        it('waits for stage and zip before installing (slow lib1, fast lib2)', async () => {
            sinon.stub(rokuDeploy as any, 'getInstalledPackages').resolves([]);
            sinon.stub(rokuDeploy, 'deleteComponentLibrary').resolves(null);
            session['rokuAdapter'] = <any>{ pauseCompileErrors: sinon.stub().resolves(), resumeCompileErrors: sinon.stub().resolves() };
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(session.projectManager, 'applyLibraryReferencePostfixes').resolves();
            session['launchConfiguration'].host = '192.168.1.100';
            session['launchConfiguration'].password = 'test123';
            session.projectManager.mainProject = <any>{
                stagingDir: s`${tempDir}/main-staging`,
                zipPackage: sinon.stub().resolves()
            };

            const events = [];
            sinon.stub(ComponentLibraryProject.prototype, 'stage').callsFake(async function(this: ComponentLibraryProject) {
                const delay = this['outFile'] === 'lib1.zip' ? 100 : 10;
                events.push(`stage-start-${this['outFile']}`);
                await util.sleep(delay);
                events.push(`stage-end-${this['outFile']}`);
            });
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').callsFake(async function(this: ComponentLibraryProject) {
                events.push(`zip-${this['outFile']}`);
                await util.sleep(1);
            });
            sinon.stub(rokuDeploy, 'publish').callsFake((options) => {
                events.push(`install-${options.outFile}`);
                return Promise.resolve({ message: 'success', results: [] });
            });

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: true }
            ] as any, 8080);

            expect(events.indexOf('install-lib1.zip')).to.be.lessThan(events.indexOf('install-lib2.zip'));
            expect(events.indexOf('stage-end-lib1.zip')).to.be.lessThan(events.indexOf('install-lib1.zip'));
            expect(events.indexOf('zip-lib2.zip')).to.be.lessThan(events.indexOf('install-lib2.zip'));
        });

        it('fails build when complib promise fails', async () => {
            sinon.stub(rokuDeploy as any, 'getInstalledPackages').resolves([]);
            sinon.stub(rokuDeploy, 'deleteComponentLibrary').resolves(null);
            session['rokuAdapter'] = <any>{ pauseCompileErrors: sinon.stub().resolves(), resumeCompileErrors: sinon.stub().resolves() };
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').resolves();
            session['launchConfiguration'].host = '192.168.1.100';
            session['launchConfiguration'].password = 'test123';

            sinon.stub(ComponentLibraryProject.prototype, 'stage').rejects(new Error('Stage failed'));

            let errorThrown = false;
            try {
                await runPrepareAndHost([
                    { rootDir: complib1Dir, outFile: 'lib1.zip', install: true }
                ] as any, 8080);
            } catch (e) {
                errorThrown = true;
                expect(e.message).to.include('Stage failed');
            }
            expect(errorThrown).to.be.true;
        });

        it('skips deleting complibs when none are marked install=true', async () => {
            const getInstalledStub = sinon.stub(rokuDeploy as any, 'getInstalledPackages').resolves([]);
            sinon.stub(rokuDeploy, 'deleteComponentLibrary').resolves(null);
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'stage').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').resolves();

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: false },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: undefined }
            ] as any, 8080);

            //no library is being installed, so we never touch the device to delete existing complibs
            expect(getInstalledStub.called).to.be.false;
        });

        it('does not start server when no component libraries present', async () => {
            const serverStub = sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();

            await runPrepareAndHost([], 8080);

            expect(serverStub.called).to.be.false;
        });

        it('calls packageTask for each component library if packageTask defined', async () => {
            stubDefaults();
            sinon.stub(rokuDeploy, 'publish').resolves({ message: 'success', results: [] });
            const sendEventStub = sinon.stub(session as any, 'sendCustomRequest').resolves();

            await runPrepareAndHost([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true, packageTask: 'build:lib1' },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: true, packageTask: 'build:lib2' },
                { rootDir: complib1Dir, outFile: 'lib3.zip', install: true }
            ] as any, 8080);

            const calls = sendEventStub.getCalls();
            expect(calls.length).to.equal(2);
            expect(calls[0].args[0]).to.equal('executeTask');
            expect(calls[0].args[1]).to.eql({ task: 'build:lib1' });
            expect(calls[1].args[0]).to.equal('executeTask');
            expect(calls[1].args[1]).to.eql({ task: 'build:lib2' });
        });

        it('handles packagePath and packageUploadOverrides for component libraries', async () => {
            stubDefaults();
            const installOrder = [];
            sinon.stub(rokuDeploy, 'publish').callsFake(async (options) => {
                installOrder.push(options);
                await util.sleep(10);
                return { message: 'success', results: [] };
            });

            const packageUploadOverrides1 = {};
            const packageUploadOverrides2 = {
                route: '1234',
                formData: {
                    one: 'two',
                    three: null
                }
            };

            await runPrepareAndHost([
                {
                    rootDir: complib1Dir,
                    outFile: 'lib1.zip',
                    install: true,
                    packagePath: s`${tempDir}/custom/cl1.zip`,
                    packageUploadOverrides: packageUploadOverrides1
                },
                {
                    rootDir: complib1Dir,
                    outFile: 'lib2.zip',
                    install: true,
                    packagePath: s`${tempDir}/custom/cl2.zip`,
                    packageUploadOverrides: packageUploadOverrides2
                }
            ] as any, 8080);

            expect(installOrder.length).to.equal(2);
            expect(installOrder[0]).to.include({
                outFile: path.basename(s`${tempDir}/custom/cl1.zip`),
                outDir: path.dirname(s`${tempDir}/custom/cl1.zip`),
                packageUploadOverrides: packageUploadOverrides1
            });
            expect(installOrder[1]).to.include({
                outFile: path.basename(s`${tempDir}/custom/cl2.zip`),
                outDir: path.dirname(s`${tempDir}/custom/cl2.zip`),
                packageUploadOverrides: packageUploadOverrides2
            });
        });
    });

    describe('deleteAllComponentLibraries', () => {
        /**
         * Simulate a device that has `installed` component libraries, where `dependencies[x]` lists the complibs
         * that `x` depends on (references). Deleting a complib that another STILL-installed complib depends on fails
         * with a device compile error - mirroring real Roku behavior - so the code must delete dependents first.
         *
         * Stubs the device calls against this fake state and returns the recorded delete order.
         */
        function stubDevice(installed: string[], dependencies: Record<string, string[]> = {}) {
            const present = new Set(installed);
            const deleteOrder: string[] = [];

            session['launchConfiguration'].host = '192.168.1.100';
            session['launchConfiguration'].password = 'test123';
            //deletion pauses/resumes compile-error reporting on the adapter; stub those so the flow works without a device
            session['rokuAdapter'] = <any>{
                pauseCompileErrors: sinon.stub().resolves(),
                resumeCompileErrors: sinon.stub().resolves()
            };

            sinon.stub(rokuDeploy as any, 'getInstalledPackages').callsFake(() => Promise.resolve(
                [...present].map(archiveFileName => ({ appType: 'dcl', archiveFileName }))
            ));

            sinon.stub(rokuDeploy, 'deleteComponentLibrary').callsFake((options: any) => {
                const target = options.fileName;
                //if any other still-installed complib depends on `target`, the device rejects with a compile error
                const blockedBy = [...present].find(other => other !== target && (dependencies[other] ?? []).includes(target));
                if (blockedBy) {
                    return Promise.reject(new Error(`Install Failure: Compilation Failed. (compile error &hb9) ... '${target}'`));
                }
                deleteOrder.push(target);
                present.delete(target);
                return Promise.resolve(null);
            });

            return { deleteOrder, present, adapter: session['rokuAdapter'] as any };
        }

        /** point the session's configured complibs at the given outFiles, in declaration order */
        function configureComplibs(outFiles: string[]) {
            session.projectManager.componentLibraryProjects = outFiles.map(outFile => ({ outFile })) as any;
        }

        it('deletes configured libraries in REVERSE configured order (dependents before dependencies)', async () => {
            //user configured C, B, A (so A depends on B+C, B depends on C) - all are installed
            configureComplibs(['LibCharlie.zip', 'LibBeta.zip', 'LibAlpha.zip']);
            const { deleteOrder, present } = stubDevice(
                ['LibCharlie.zip', 'LibBeta.zip', 'LibAlpha.zip'],
                { 'LibAlpha.zip': ['LibBeta.zip', 'LibCharlie.zip'], 'LibBeta.zip': ['LibCharlie.zip'] }
            );

            await session['deleteAllComponentLibraries']();

            //reverse of configured order - and because that's dependency-correct, every delete succeeds first try
            expect(deleteOrder).to.eql(['LibAlpha.zip', 'LibBeta.zip', 'LibCharlie.zip']);
            expect(present.size).to.equal(0);
        });

        it('pauses compile-error reporting during deletion, and leaves it paused (resume happens later, before re-install)', async () => {
            configureComplibs(['LibAlpha.zip']);
            const { adapter } = stubDevice(['LibAlpha.zip']);

            await session['deleteAllComponentLibraries']();

            //compile errors are paused so deletion noise doesn't reach the UI...
            expect(adapter.pauseCompileErrors.called).to.be.true;
            //...and NOT resumed here - resume is deferred until we put libraries back on the device
            expect(adapter.resumeCompileErrors.called).to.be.false;
        });

        it('deletes everything even when the device lists them in a dependency-breaking order', async () => {
            //the device reports installed complibs alphabetically (Alpha, Beta, Charlie), but we still delete safely
            configureComplibs(['LibCharlie.zip', 'LibBeta.zip', 'LibAlpha.zip']);
            const { deleteOrder, present } = stubDevice(
                ['LibAlpha.zip', 'LibBeta.zip', 'LibCharlie.zip'],
                { 'LibAlpha.zip': ['LibBeta.zip', 'LibCharlie.zip'], 'LibBeta.zip': ['LibCharlie.zip'] }
            );

            await session['deleteAllComponentLibraries']();

            expect(deleteOrder).to.eql(['LibAlpha.zip', 'LibBeta.zip', 'LibCharlie.zip']);
            expect(present.size).to.equal(0);
        });

        it('deletes unconfigured (orphan) libraries too, using compile-error tolerance for their order', async () => {
            //none of the installed complibs are configured; orphan2 depends on orphan1, so orphan2 must go first
            configureComplibs([]);
            const { deleteOrder, present } = stubDevice(
                ['orphan1.zip', 'orphan2.zip'],
                { 'orphan2.zip': ['orphan1.zip'] }
            );

            await session['deleteAllComponentLibraries']();

            expect(deleteOrder).to.eql(['orphan2.zip', 'orphan1.zip']);
            expect(present.size).to.equal(0);
        });

        it('deletes configured libraries first, then orphans', async () => {
            //configured A (depends on nothing here) plus a leftover orphan that depends on A
            configureComplibs(['LibAlpha.zip']);
            const { deleteOrder, present } = stubDevice(
                ['LibAlpha.zip', 'orphan.zip'],
                { 'orphan.zip': ['LibAlpha.zip'] }
            );

            await session['deleteAllComponentLibraries']();

            //orphan depends on LibAlpha, so it must be deleted before LibAlpha despite LibAlpha being configured
            expect(deleteOrder).to.eql(['orphan.zip', 'LibAlpha.zip']);
            expect(present.size).to.equal(0);
        });

        it('returns without error when no component libraries are installed', async () => {
            configureComplibs(['LibAlpha.zip']);
            const { deleteOrder } = stubDevice([]);

            await session['deleteAllComponentLibraries']();

            expect(deleteOrder).to.eql([]);
        });

        it('re-throws a non-compile error (e.g. auth/network failure) immediately', async () => {
            configureComplibs(['LibAlpha.zip']);
            session['launchConfiguration'].host = '192.168.1.100';
            sinon.stub(rokuDeploy as any, 'getInstalledPackages').resolves([{ appType: 'dcl', archiveFileName: 'LibAlpha.zip' }]);
            sinon.stub(rokuDeploy, 'deleteComponentLibrary').rejects(new Error('Unauthorized. Please verify credentials'));

            await expectThrowsAsync(() => session['deleteAllComponentLibraries']());
        });

        it('throws when a component library can never be deleted (after exhausting attempts)', async function() {
            this.timeout(5000);
            configureComplibs([]);
            //a complib that always fails with a compile error and is never unblocked - should give up and throw
            sinon.stub(rokuDeploy as any, 'getInstalledPackages').resolves([{ appType: 'dcl', archiveFileName: 'stuck.zip' }]);
            session['launchConfiguration'].host = '192.168.1.100';
            sinon.stub(rokuDeploy, 'deleteComponentLibrary').rejects(new Error('Install Failure: Compilation Failed. (compile error &hb9)'));

            await expectThrowsAsync(() => session['deleteAllComponentLibraries']());
        });
    });

    describe('completionsRequest', () => {
        //build an in-memory variable node. Pass `children` to make it a container (AA/array); otherwise
        //it is a leaf. Only the fields the lookup/completion code reads (name, type, frameId, childVariables)
        //carry meaning; the rest are harmless defaults.
        function makeVariable(name: string, options: { type?: VariableType | string; frameId?: number; variablesReference?: number; children?: AugmentedVariable[] } = {}): AugmentedVariable {
            const children = options.children ?? [];
            return {
                name: name,
                value: '',
                variablesReference: options.variablesReference ?? (children.length > 0 ? 10 : 0),
                frameId: options.frameId ?? 0,
                type: options.type ?? VariableType.String,
                childVariables: children
            } as AugmentedVariable;
        }

        describe('getClosestCompletionDetails', () => {
            //the cursor position is marked inline with `|` (stripped before evaluating). Every case is
            //asserted under both client column/line bases, since the resolved path must not depend on
            //whether the client numbers columns/lines from 0 or from 1.
            function expectClosest(textWithCursor: string, expected: { parentVariablePath: string[]; stringKeyClosing?: string } | undefined) {
                const cursorIndex = textWithCursor.indexOf('|');
                const text = textWithCursor.replace('|', '');
                const textBeforeCursor = textWithCursor.slice(0, cursorIndex);
                const cursorLine = (textBeforeCursor.match(/\n/g) ?? []).length;
                const cursorColumn = textBeforeCursor.length - (textBeforeCursor.lastIndexOf('\n') + 1);

                for (const startAt1 of [false, true]) {
                    session['_clientColumnsStartAt1'] = startAt1;
                    session['_clientLinesStartAt1'] = startAt1;
                    const column = startAt1 ? cursorColumn + 1 : cursorColumn;
                    //a cursor on the first line is sent without an explicit line (matches the real client)
                    let line: number;
                    if (cursorLine > 0) {
                        line = startAt1 ? cursorLine + 1 : cursorLine;
                    }
                    expect(
                        session['getClosestCompletionDetails']({ text: text, column: column, line: line, frameId: 0 }),
                        `columnsStartAt1=${startAt1}`
                    ).to.eql(expected);
                }
            }

            it('treats an empty line as a local-scope expression', () => {
                expectClosest('|', { parentVariablePath: [''] });
            });

            it('returns undefined for an invalid variable path', () => {
                expectClosest('1bad.path|', undefined);
            });

            it('completes the siblings of a partial trailing segment', () => {
                expectClosest('person.name|', { parentVariablePath: ['person'] });
            });

            it('completes the members of a path with a trailing period', () => {
                expectClosest('person.name.|', { parentVariablePath: ['person', 'name'] });
            });

            it('returns undefined when the cursor is mid-token', () => {
                expectClosest('person.na|me', undefined);
            });

            it('returns undefined after a function-call result, but resolves indexed access', () => {
                //a call result is not a resolvable variable path
                expectClosest('getPerson().name|', undefined);
                //indexed access, however, is a resolvable variable path
                expectClosest('getPerson[0].name|', { parentVariablePath: ['getPerson', '0'] });
            });

            it('resolves a path typed inside an open bracket', () => {
                expectClosest('getValue(person.name|', { parentVariablePath: ['person'] });
                expectClosest('getValue[person.name|', { parentVariablePath: ['person'] });
            });

            it('resolves a path inside a call with a trailing close paren', () => {
                expectClosest('getValue(person.name|)', { parentVariablePath: ['person'] });
            });

            it('treats the position after a comma as a fresh local-scope expression', () => {
                expectClosest('getValue(person.name, test|)', { parentVariablePath: [''] });
                expectClosest('getValue[person.name, test|]', { parentVariablePath: [''] });
            });

            it('resolves the path on the line the cursor is on (multiline input)', () => {
                //cursor on the first line, mid-expression
                expectClosest('getValue(person.name|, {\ntemp: test\n})', { parentVariablePath: ['person'] });
                //cursor on the second line, a fresh local-scope expression
                expectClosest('getValue(person.name, {\ntemp: test|\n})', { parentVariablePath: [''] });
            });

            it('handles the print shorthand (?) before member access', () => {
                expectClosest('?m.|', { parentVariablePath: ['m'] });
            });

            it('handles the print keyword before member access', () => {
                expectClosest('print m.|', { parentVariablePath: ['m'] });
            });

            it('handles a deeply nested dotted path', () => {
                expectClosest('a.b.c.|', { parentVariablePath: ['a', 'b', 'c'] });
            });

            it('treats a trailing space as a fresh (local scope) expression position', () => {
                expectClosest('m.top |', { parentVariablePath: [''] });
            });

            it('treats an open curly brace as a fresh (local scope) expression position', () => {
                expectClosest('getValue({|', { parentVariablePath: [''] });
            });

            it('does not crash when the cursor column is past the end of the line', () => {
                //the client can report a column well past the end of the text; we must not throw
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'm',
                    column: 50,
                    line: undefined,
                    frameId: 0
                })).to.eql({ parentVariablePath: [''] });
            });

            it('resolves indexed (numeric) access followed by a dot', () => {
                //resolves to the indexed parent so we can complete the members of `arr[0]`
                expectClosest('arr[0].|', { parentVariablePath: ['arr', '0'] });
            });

            //a partial string-key access resolves to the parent object (so we can complete its keys) rather
            //than collapsing to the local scope and dumping every global. `stringKeyClosing` is the text to
            //append when accepting a key, so completions can close the access.
            it('resolves partial string-key access to the parent object', () => {
                expectClosest('m["fo|', { parentVariablePath: ['m'], stringKeyClosing: '"]' });
            });

            it('does not auto-close a string key that already has a closing bracket', () => {
                //cursor is right after `fo`, with `"]` already present
                expectClosest('m["fo|"]', { parentVariablePath: ['m'], stringKeyClosing: '' });
            });

            it('resolves member access on a completed string-key access (key stays quoted)', () => {
                //the string key keeps its quotes so it stays case-sensitive when sent to the device
                expectClosest('m.global["spoof"].|', { parentVariablePath: ['m', 'global', '"spoof"'] });
            });

            it('resolves member access on a completed string key that contains an escaped quote', () => {
                //the escaped `""` is preserved in the path segment so the device lookup stays valid
                expectClosest('m["a""b"].|', { parentVariablePath: ['m', '"a""b"'] });
            });
        });

        describe('findVariableByPath', () => {
            it('walks childVariables down a multi-segment path', () => {
                const variables = [
                    makeVariable('a', { children: [
                        makeVariable('b', { children: [
                            makeVariable('c')
                        ] })
                    ] })
                ];
                expect(session['findVariableByPath'](variables, ['a', 'b', 'c'], 0)?.name).to.eql('c');
            });

            it('returns null when the frameId does not match', () => {
                const variables = [makeVariable('a')];
                expect(session['findVariableByPath'](variables, ['a'], 1)).to.be.null;
            });

            //NOTE: this characterizes the current scope-blind behavior. The first segment is matched
            //against whatever entry appears first in the list, with no notion of which one is the
            //frame's actual local. See the matching GAP test in `completionsRequest (full flow)`.
            it('returns the first matching entry by name (scope-blind)', () => {
                const variables = [
                    makeVariable('person', { children: [makeVariable('first')] }),
                    makeVariable('person', { children: [makeVariable('second')] })
                ];
                expect(session['findVariableByPath'](variables, ['person'], 0)?.childVariables[0].name).to.eql('first');
            });

            it('matches names case-insensitively and tolerates quoted string keys', () => {
                //device reports names lower-cased
                const variables = [makeVariable('topref', { children: [makeVariable('spoof')] })];
                //user typed `topRef` (different case) and a quoted string key
                expect(session['findVariableByPath'](variables, ['topRef'], 0)?.name).to.eql('topref');
                expect(session['findVariableByPath'](variables, ['topRef', '"spoof"'], 0)?.name).to.eql('spoof');
            });

            it('matches a string key that contains a literal quote (escaped in the typed path)', () => {
                //device reports the raw key `a"b`; the user typed it escaped as `["a""b"]`
                const variables = [makeVariable('m', { children: [makeVariable('a"b')] })];
                expect(session['findVariableByPath'](variables, ['m', '"a""b"'], 0)?.name).to.eql('a"b');
            });
        });

        describe('completionsRequest (full flow)', () => {
            let response: DebugProtocol.CompletionsResponse;

            beforeEach(() => {
                session['_clientColumnsStartAt1'] = true;
                session['_clientLinesStartAt1'] = true;
                session['variables'] = {};
                response = {
                    request_seq: 0,
                    success: true,
                    command: 'completions',
                    seq: 0,
                    type: 'response',
                    body: { targets: [] }
                } as DebugProtocol.CompletionsResponse;
            });

            //run a completion request with the cursor at the end of `text` (the beforeEach reports 1-based columns)
            async function requestCompletions(text: string, frameId = 0) {
                await session['completionsRequest'](
                    response,
                    { text: text, column: text.length + 1, frameId: frameId } as DebugProtocol.CompletionsArguments
                );
            }

            function targetLabels() {
                return (response.body.targets ?? []).map(target => target.label);
            }

            function findTarget(label: string) {
                return response.body.targets.find(target => target.label === label);
            }

            //seed the frame's local scope container the same way scopesRequest/populateScopeVariables would
            function seedLocals(children: AugmentedVariable[], frameId = 0) {
                const refId = session['getEvaluateRefId']('$$locals', frameId);
                session['variables'][refId] = {
                    name: 'Local',
                    value: '',
                    type: '$$Locals',
                    frameId: frameId,
                    isScope: true,
                    variablesReference: refId,
                    childVariables: children
                } as AugmentedVariable;
            }

            //the EvaluateContainer the device adapter returns for an associative array with the given string keys
            function deviceAssociativeArray(name: string, keys: string[]): EvaluateContainer {
                return {
                    name: name,
                    evaluateName: name,
                    type: VariableType.AssociativeArray,
                    keyType: 'String',
                    value: 'roAssociativeArray',
                    children: keys.map(key => ({
                        name: key,
                        evaluateName: `${name}.${key}`,
                        type: VariableType.String,
                        value: '',
                        keyType: null,
                        children: []
                    })),
                    indexedVariables: 0,
                    namedVariables: keys.length
                } as unknown as EvaluateContainer;
            }

            it('returns object members (fields + interface methods) for dot access, without globals', async () => {
                seedLocals([
                    makeVariable('person', { type: VariableType.AssociativeArray, children: [
                        makeVariable('firstName'),
                        makeVariable('lastName')
                    ] })
                ]);

                await requestCompletions('person.');

                //child fields
                expect(targetLabels()).to.include.members(['firstName', 'lastName']);
                //ifAssociativeArray interface methods
                expect(targetLabels()).to.include.members(['Count', 'Delete']);
                //should NOT leak globals on member access
                expect(targetLabels()).to.not.include('Abs');

                //the child fields should be typed as `field`
                const firstName = findTarget('firstName');
                expect(firstName?.type).to.eql('field');
                //after a trailing `.` the completion inserts at the cursor (nothing to replace yet).
                //`start` is a 0-based offset into the line ("person." -> offset 7)
                expect(firstName?.start).to.eql(7);
                expect(firstName?.length).to.eql(0);
            });

            it('returns locals + globals + scope functions for an empty (local scope) expression', async () => {
                seedLocals([makeVariable('localA')]);
                rokuAdapter.getStackFrameById = (() => ({ filePath: 'pkg:/source/main.brs' })) as any;
                sinon.stub(session.projectManager, 'getScopeFunctionsForFile').resolves([
                    { name: 'MyScopeFunc', completionItemKind: 'function' }
                ]);

                await requestCompletions('');

                expect(targetLabels()).to.include('localA'); //a local
                expect(targetLabels()).to.include('Abs'); //a global
                expect(targetLabels()).to.include('MyScopeFunc'); //a scope function
            });

            it('returns no completions when the parent variable cannot be resolved', async () => {
                sinon.stub(rokuAdapter, 'getVariable').rejects(new Error('not found'));

                await requestCompletions('doesNotExist.');

                expect(response.body.targets).to.eql([]);
            });

            it('ranks local variables above globals', async () => {
                seedLocals([makeVariable('localA')]);
                rokuAdapter.getStackFrameById = (() => ({ filePath: 'pkg:/source/main.brs' })) as any;
                sinon.stub(session.projectManager, 'getScopeFunctionsForFile').resolves([]);

                await requestCompletions('');

                const local = findTarget('localA');
                const global = findTarget('Abs');
                expect(local?.sortText < global?.sortText, 'local variable should sort before global').to.be.true;
            });

            it('resolves the first segment against the frame locals, not a same-named nested field', async () => {
                //the real local `person`
                seedLocals([
                    makeVariable('person', { type: VariableType.AssociativeArray, children: [makeVariable('firstName')] })
                ]);
                //a nested `person` field that lingers in the flat `variables` map; it must NOT shadow the real local
                session['variables'][9999] = makeVariable('person', {
                    type: VariableType.AssociativeArray,
                    variablesReference: 9999,
                    children: [makeVariable('wrongField')]
                });

                await requestCompletions('person.');

                expect(targetLabels()).to.include('firstName');
                expect(targetLabels()).to.not.include('wrongField');
            });

            it('completes string keys with a text-edit that closes the access and omits interface methods', async () => {
                seedLocals([
                    makeVariable('m', { type: VariableType.AssociativeArray, children: [
                        makeVariable('firstName'),
                        makeVariable('lastName')
                    ] })
                ]);

                await requestCompletions('m["fo');

                //the AA keys are offered
                expect(targetLabels()).to.include.members(['firstName', 'lastName']);
                //ifAssociativeArray methods are NOT valid string keys, so they are suppressed
                expect(targetLabels()).to.not.include('Count');

                const firstName = findTarget('firstName');
                //accepting inserts the key and closes the access, replacing the typed `fo`
                //(`start` is the 0-based offset of `f` in `m["fo`)
                expect(firstName.text).to.eql('firstName"]');
                expect(firstName.start).to.eql(3);
                expect(firstName.length).to.eql(2);
            });

            it('escapes embedded double-quotes when inserting a string-key completion', async () => {
                //a key whose name contains a literal `"` (BrightScript escapes a `"` inside a string as `""`)
                seedLocals([
                    makeVariable('m', { type: VariableType.AssociativeArray, children: [makeVariable('a"b')] })
                ]);

                await requestCompletions('m["');

                const key = findTarget('a"b');
                //the label stays human-readable, but the inserted text escapes the `"` so the access is
                //valid: `m["` + `a""b"]` -> `m["a""b"]`
                expect(key.text).to.eql('a""b"]');
            });

            it('escapes a quote-only key so the completed access is the literal-quote form', async () => {
                //the key is a single `"`; the valid source form is `m[""""]` (four quotes = the string `"`)
                seedLocals([
                    makeVariable('m', { type: VariableType.AssociativeArray, children: [makeVariable('"')] })
                ]);

                await requestCompletions('m["');

                const key = findTarget('"');
                //`m["` + `"""]` -> `m[""""]`
                expect(key.text).to.eql('"""]');
            });

            it('rewrites a non-identifier member as bracket access, consuming the dot', async () => {
                seedLocals([
                    makeVariable('m', { type: VariableType.AssociativeArray, children: [
                        makeVariable('countrycode'),
                        makeVariable('contry code') //a space -> not dot-accessible
                    ] })
                ]);

                await requestCompletions('m.');

                //a normal identifier key keeps dot access (no text override; the label is inserted after the `.`)
                const normal = findTarget('countrycode');
                expect(normal.text).to.be.undefined;

                //a key with a space can't be dot-accessed, so it is rewritten as bracket access and the `.` is
                //consumed: `m.` -> `m["contry code"]`
                const spaced = findTarget('contry code');
                expect(spaced.text).to.eql('["contry code"]');
                expect(spaced.start).to.eql(1);
                expect(spaced.length).to.eql(1);
            });

            it('escapes embedded quotes when rewriting a dot member as bracket access', async () => {
                seedLocals([
                    makeVariable('m', { type: VariableType.AssociativeArray, children: [makeVariable('a"b')] })
                ]);

                await requestCompletions('m.');

                const key = findTarget('a"b');
                //`m.` -> `m["a""b"]`
                expect(key.text).to.eql('["a""b"]');
                expect(key.start).to.eql(1);
                expect(key.length).to.eql(1);
            });

            it('consumes the partial word and the dot when rewriting a dot member as bracket access', async () => {
                seedLocals([
                    makeVariable('m', { type: VariableType.AssociativeArray, children: [makeVariable('my-key')] })
                ]);

                await requestCompletions('m.my');

                const key = findTarget('my-key');
                //`m.my` -> `m["my-key"]` (the `.my` span is replaced)
                expect(key.text).to.eql('["my-key"]');
                expect(key.start).to.eql(1);
                expect(key.length).to.eql(3);
            });

            function seedArray() {
                seedLocals([
                    makeVariable('arr', { type: VariableType.Array, children: [
                        makeVariable('0'),
                        makeVariable('1')
                    ] })
                ]);
            }

            it('offers array methods (not index entries) for member access on an array', async () => {
                seedArray();

                await requestCompletions('arr.');

                //ifArray methods are offered
                expect(targetLabels()).to.include.members(['Count', 'Push']);
                //the integer indexes are NOT offered (`arr.0` / `arr.[0]` aren't valid)
                expect(targetLabels()).to.not.include('0');
                expect(targetLabels()).to.not.include('[0]');
            });

            it('offers no completions for a string-key access on an array', async () => {
                seedArray();

                //a string-key access on an array is invalid (arrays are integer-indexed)
                await requestCompletions('arr["');

                expect(response.body.targets).to.eql([]);
            });

            it('falls back to a device lookup and caches the result for the paused state', async () => {
                //note: no locals are seeded, so the parent must be resolved from the device
                const getVariableStub = sinon.stub(rokuAdapter, 'getVariable').resolves(
                    deviceAssociativeArray('person', ['firstName'])
                );

                await requestCompletions('person.');
                expect(targetLabels()).to.include('firstName');
                expect(getVariableStub.callCount).to.eql(1);

                //a second identical request should be served from the cache without another device round-trip
                await requestCompletions('person.');
                expect(targetLabels()).to.include('firstName');
                expect(getVariableStub.callCount).to.eql(1);

                //resuming/stepping clears the cache, so the next lookup hits the device again
                session['clearState']();
                await requestCompletions('person.');
                expect(getVariableStub.callCount).to.eql(2);
            });

            it('populates the frame locals on demand for local-scope completions', async () => {
                //the locals scope exists but has not been populated yet (Variables panel not expanded)
                const refId = session['getEvaluateRefId']('$$locals', 0);
                session['variables'][refId] = {
                    name: 'Locals',
                    value: '',
                    type: '$$Locals',
                    frameId: 0,
                    isScope: true,
                    variablesReference: refId,
                    childVariables: []
                } as AugmentedVariable;
                //the device returns the frame's locals when asked
                (rokuAdapter as any).getLocalVariables = (() => Promise.resolve(
                    deviceAssociativeArray('$$locals', ['environment'])
                )) as any;
                rokuAdapter.getStackFrameById = (() => ({ filePath: 'pkg:/source/main.brs' })) as any;
                sinon.stub(session.projectManager, 'getScopeFunctionsForFile').resolves([]);

                await requestCompletions('');

                //the local was fetched on demand (without the Variables panel being expanded)
                expect(targetLabels()).to.include('environment');
                //globals are still present
                expect(targetLabels()).to.include('Abs');
            });

            it('anchors completions to the partial word so the client can filter as the user types', async () => {
                seedLocals([makeVariable('spoofDetails')]);
                rokuAdapter.getStackFrameById = (() => ({ filePath: 'pkg:/source/main.brs' })) as any;
                sinon.stub(session.projectManager, 'getScopeFunctionsForFile').resolves([]);

                //the response must describe the span being replaced (`spo`, a 0-based offset of 0 spanning
                //3 characters) so the client filters the list correctly as the user keeps typing
                await requestCompletions('spo');

                const local = findTarget('spoofDetails');
                expect(local, 'local should be present in the response').to.exist;
                expect(local.start).to.eql(0);
                expect(local.length).to.eql(3);
                //globals carry the same replacement range so the whole list filters consistently
                const global = findTarget('Abs');
                expect(global.start).to.eql(0);
                expect(global.length).to.eql(3);
            });

            it('rebuilds an indexed path with bracket notation for the device lookup', async () => {
                //no locals seeded, so resolution falls to the device
                const getVariableStub = sinon.stub(rokuAdapter, 'getVariable').resolves(
                    deviceAssociativeArray('services[0]', ['id'])
                );

                await requestCompletions('services[0].');

                //the index must be preserved as `[0]`, not flattened to the invalid `services.0`
                expect(getVariableStub.calledWith('services[0]', 0)).to.be.true;
                expect(targetLabels()).to.include('id');
            });

            it('resolves member access on a string-key result (m.global["spoof"].)', async () => {
                const getVariableStub = sinon.stub(rokuAdapter, 'getVariable').resolves(
                    deviceAssociativeArray('m.global.spoof', ['countrycode', 'postalcode'])
                );

                await requestCompletions('m.global["spoof"].');

                //the string key keeps its quotes so the device lookup stays `m.global["spoof"]` (case-sensitive)
                expect(getVariableStub.calledWith('m.global["spoof"]', 0)).to.be.true;
                expect(targetLabels()).to.include.members(['countrycode', 'postalcode']);
                expect(targetLabels()).to.not.include('Abs');
            });
        });

        describe('buildVariableExpression', () => {
            it('uses dot access for identifiers and brackets for indexes and string keys', () => {
                expect(session['buildVariableExpression'](['m', 'top'])).to.eql('m.top');
                expect(session['buildVariableExpression'](['m', 'applicationServices', '0'])).to.eql('m.applicationServices[0]');
                expect(session['buildVariableExpression'](['arr', '0', 'name'])).to.eql('arr[0].name');
                //already-quoted string keys keep their quotes (stay case-sensitive on the device)
                expect(session['buildVariableExpression'](['m', 'global', '"spoof"'])).to.eql('m.global["spoof"]');
                expect(session['buildVariableExpression'](['m', 'my-key'])).to.eql('m["my-key"]');
                //a `"` inside a key is escaped as `""` so the expression stays valid
                expect(session['buildVariableExpression'](['m', 'a"b'])).to.eql('m["a""b"]');
                expect(session['buildVariableExpression'](['m', '"'])).to.eql('m[""""]');
                expect(session['buildVariableExpression']([''])).to.eql('');
            });
        });
    });

    describe('initializeProfiling', () => {
        let enableTracingStub: SinonStub;

        beforeEach(() => {
            //set device info to support perfetto tracing (OS >= 15.2)
            session['deviceInfo'] = { softwareVersion: '15.2.0' } as any;

            //stub PerfettoManager prototype methods so no real connections are made
            enableTracingStub = sinon.stub(PerfettoManager.prototype, 'enableTracing').resolves(true);
            sinon.stub(PerfettoManager.prototype, 'on').returns(() => { });
        });

        it('calls enableTracing when profiling.tracing.enable is true and device supports perfetto', async () => {
            launchConfiguration.profiling = { tracing: { enable: true } } as any;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(1);
        });

        it('does not call enableTracing when profiling.tracing.enable is false and device supports perfetto', async () => {
            launchConfiguration.profiling = { tracing: { enable: false } } as any;

            await session['initializeProfiling']();

            //there is no way to disable perfetto tracing on the device, so we just skip it
            expect(enableTracingStub.callCount).to.equal(0);
        });

        it('does not call enableTracing when profiling.tracing.enable is undefined', async () => {
            launchConfiguration.profiling = { tracing: {} } as any;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
        });

        it('does not call enableTracing when profiling.tracing is undefined', async () => {
            launchConfiguration.profiling = {} as any;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
        });

        it('does not call enableTracing when profiling is undefined', async () => {
            launchConfiguration.profiling = undefined;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
        });

        it('does not call enableTracing when enable is true but device does not support perfetto', async () => {
            launchConfiguration.profiling = { tracing: { enable: true } } as any;
            session['deviceInfo'] = { softwareVersion: '14.0.0' } as any;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
        });

        it('does not call enableTracing when enable is false but device does not support perfetto', async () => {
            launchConfiguration.profiling = { tracing: { enable: false } } as any;
            session['deviceInfo'] = { softwareVersion: '14.0.0' } as any;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
        });

        it('logs a warning and shows a popup when enable is true but device firmware is too old', async () => {
            launchConfiguration.profiling = { tracing: { enable: true } } as any;
            session['deviceInfo'] = { softwareVersion: '14.0.0' } as any;
            const warnSpy = sinon.spy(session.logger, 'warn');
            const sendCustomRequestStub = sinon.stub(session as any, 'sendCustomRequest').resolves();

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
            expect(warnSpy.callCount).to.be.greaterThan(0);
            expect(warnSpy.getCall(0).args[0]).to.include('14.0.0');
            expect(warnSpy.getCall(0).args[0]).to.include('15.2');
            expect(sendCustomRequestStub.callCount).to.equal(1);
            expect(sendCustomRequestStub.getCall(0).args[0]).to.equal('showPopupMessage');
        });

        it('catches and logs error when enableTracing throws (enable=true)', async () => {
            launchConfiguration.profiling = { tracing: { enable: true } } as any;
            enableTracingStub.rejects(new Error('connection failed'));

            await session['initializeProfiling']();

            expect(errorSpy.callCount).to.be.greaterThan(0);
            expect(errorSpy.getCall(0).args[0]).to.include('Failed to enable perfetto tracing');
        });

        it('does not call enableTracing when enable is false (no way to disable perfetto tracing)', async () => {
            launchConfiguration.profiling = { tracing: { enable: false } } as any;

            await session['initializeProfiling']();

            expect(enableTracingStub.callCount).to.equal(0);
        });
    });

    describe('tryProfilingConnectOnStart', () => {
        let startTracingStub: SinonStub;

        beforeEach(() => {
            //set device info to support perfetto tracing (OS >= 15.2)
            session['deviceInfo'] = { softwareVersion: '15.2.0' } as any;

            //stub PerfettoManager prototype methods so no real connections are made
            startTracingStub = sinon.stub(PerfettoManager.prototype, 'startTracing').resolves();
            sinon.stub(PerfettoManager.prototype, 'on').returns(() => { });
            session['perfettoManager'] = new PerfettoManager({ host: 'localhost' });
        });

        it('calls startTracing when connectOnStart is true and device supports perfetto', async () => {
            launchConfiguration.profiling = { tracing: { connectOnStart: true } } as any;

            await session['tryProfilingConnectOnStart']();

            expect(startTracingStub.callCount).to.equal(1);
        });

        it('does not call startTracing when connectOnStart is false', async () => {
            launchConfiguration.profiling = { tracing: { connectOnStart: false } } as any;

            await session['tryProfilingConnectOnStart']();

            expect(startTracingStub.callCount).to.equal(0);
        });

        it('does not call startTracing when connectOnStart is undefined', async () => {
            launchConfiguration.profiling = { tracing: {} } as any;

            await session['tryProfilingConnectOnStart']();

            expect(startTracingStub.callCount).to.equal(0);
        });

        it('logs a warning and shows a popup when connectOnStart is true but device firmware is too old', async () => {
            launchConfiguration.profiling = { tracing: { connectOnStart: true } } as any;
            session['deviceInfo'] = { softwareVersion: '14.0.0' } as any;
            const warnSpy = sinon.spy(session.logger, 'warn');
            const sendCustomRequestStub = sinon.stub(session as any, 'sendCustomRequest').resolves();

            await session['tryProfilingConnectOnStart']();

            expect(startTracingStub.callCount).to.equal(0);
            expect(warnSpy.callCount).to.be.greaterThan(0);
            expect(warnSpy.getCall(0).args[0]).to.include('14.0.0');
            expect(warnSpy.getCall(0).args[0]).to.include('15.2');
            expect(sendCustomRequestStub.callCount).to.equal(1);
            expect(sendCustomRequestStub.getCall(0).args[0]).to.equal('showPopupMessage');
        });

        it('catches and logs error when startTracing throws', async () => {
            launchConfiguration.profiling = { tracing: { connectOnStart: true } } as any;
            startTracingStub.rejects(new Error('connection failed'));

            await session['tryProfilingConnectOnStart']();

            expect(errorSpy.callCount).to.be.greaterThan(0);
            expect(errorSpy.getCall(0).args[0]).to.include('Failed to start perfetto tracing on start');
        });
    });

    describe('sendLaunchProgress', () => {
        let events: any[];

        beforeEach(() => {
            events = [];
            sinon.stub(session, 'sendEvent').callsFake((event) => events.push(event));
        });

        it('does nothing when supportsProgressReporting is false', () => {
            session['initRequestArgs'].supportsProgressReporting = false;
            session['sendLaunchProgress']('start', 'Packaging');
            expect(events).to.be.empty;
        });

        it('does nothing when supportsProgressReporting is not set', () => {
            delete session['initRequestArgs'].supportsProgressReporting;
            session['sendLaunchProgress']('start', 'Packaging');
            expect(events).to.be.empty;
        });

        it('sends ProgressStartEvent with the correct title and message', () => {
            session['initRequestArgs'].supportsProgressReporting = true;
            session['sendLaunchProgress']('start', 'Packaging');
            expect(events).to.have.lengthOf(1);
            expect(events[0]).to.be.instanceOf(ProgressStartEvent);
            expect(events[0].body.title).to.equal('Launching');
            expect(events[0].body.message).to.equal('Packaging...');
        });

        it('assigns a launchProgressId on start', () => {
            session['initRequestArgs'].supportsProgressReporting = true;
            expect(session['launchProgressId']).to.be.undefined;
            session['sendLaunchProgress']('start', 'Packaging');
            expect(session['launchProgressId']).to.be.a('string').and.not.be.empty;
        });

        it('sends ProgressUpdateEvent referencing the same progressId', () => {
            session['initRequestArgs'].supportsProgressReporting = true;
            session['sendLaunchProgress']('start', 'Packaging');
            const progressId = session['launchProgressId'];

            session['sendLaunchProgress']('update', 'Uploading to Roku');

            expect(events).to.have.lengthOf(2);
            expect(events[1]).to.be.instanceOf(ProgressUpdateEvent);
            expect(events[1].body.progressId).to.equal(progressId);
            expect(events[1].body.message).to.equal('Uploading to Roku...');
        });

        it('sends ProgressEndEvent after delay and clears launchProgressId', () => {
            const clock = sinon.useFakeTimers();
            session['initRequestArgs'].supportsProgressReporting = true;
            session['sendLaunchProgress']('start', 'Packaging');
            const progressId = session['launchProgressId'];

            session['sendLaunchProgress']('end');

            // 'end' immediately emits a ProgressUpdateEvent (final status message) and clears launchProgressId
            expect(events).to.have.lengthOf(2);
            expect(events[1]).to.be.instanceOf(ProgressUpdateEvent);
            expect(session['launchProgressId']).to.be.undefined;

            // After the delay, ProgressEndEvent is sent
            clock.tick(1100);
            expect(events).to.have.lengthOf(3);
            expect(events[2]).to.be.instanceOf(ProgressEndEvent);
            expect(events[2].body.progressId).to.equal(progressId);
        });

        it('update is a no-op when no progress is active', () => {
            session['initRequestArgs'].supportsProgressReporting = true;
            session['sendLaunchProgress']('update', 'Uploading to Roku');
            expect(events).to.be.empty;
        });

        it('end is a no-op when no progress is active', () => {
            session['initRequestArgs'].supportsProgressReporting = true;
            session['sendLaunchProgress']('end');
            expect(events).to.be.empty;
        });

        it('each start call generates a unique progressId', () => {
            session['initRequestArgs'].supportsProgressReporting = true;

            session['sendLaunchProgress']('start', 'First launch');
            const firstId = session['launchProgressId'];
            session['sendLaunchProgress']('end');

            session['sendLaunchProgress']('start', 'Second launch');
            const secondId = session['launchProgressId'];

            expect(firstId).to.be.a('string').and.not.be.empty;
            expect(secondId).to.be.a('string').and.not.be.empty;
            expect(firstId).to.not.equal(secondId);
        });
    });

    describe('launchRequest', () => {
        function setupLaunchStubs() {
            sinon.stub(util, 'dnsLookup').callsFake((host) => Promise.resolve(host));
            sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ developerEnabled: true } as any);
            sinon.stub(session, 'prepareMainProject').resolves();
            sinon.stub(session as any, 'prepareComponentLibraries').resolves();
            sinon.stub(session as any, 'writeMainProjectBreakpoints').resolves();
            sinon.stub(session as any, 'writeAndPostfixComponentLibraries').resolves();
            sinon.stub(session.projectManager, 'applyLibraryReferencePostfixes').resolves();
            sinon.stub(session as any, 'zipMainProject').resolves();
            sinon.stub(session as any, 'zipAndHostComponentLibraries').resolves();
            sinon.stub(session, 'initRendezvousTracking').resolves();
            // Prevent createRokuAdapter from replacing the mock rokuAdapter with a real adapter
            sinon.stub(session as any, 'createRokuAdapter').callsFake(() => { });
            sinon.stub(session as any, 'runAutomaticSceneGraphCommands').resolves();
            sinon.stub(session as any, 'publish').resolves();
            sinon.stub(session, 'setupProcessErrorHandlers');
            rokuAdapter.connected = true;
        }

        describe('progress events', () => {
            let events: any[];

            beforeEach(() => {
                events = [];
                sinon.stub(session, 'sendEvent').callsFake((event) => events.push(event));
            });

            function getProgressEvents() {
                return events.filter(e =>
                    e instanceof ProgressStartEvent ||
                    e instanceof ProgressUpdateEvent ||
                    e instanceof ProgressEndEvent
                );
            }

            it('emits progress events in the correct order', async function() {
                this.timeout(5000);
                setupLaunchStubs();
                session['initRequestArgs'].supportsProgressReporting = true;

                await session.launchRequest({} as any, launchConfiguration);
                await (session as any).configurationDoneRequest({} as any, {} as any);

                const progressEvents = getProgressEvents();
                expect(progressEvents).to.have.lengthOf(6);
                expect(progressEvents[0]).to.be.instanceOf(ProgressStartEvent);
                expect((progressEvents[0].body as any).message).to.equal('Finding device on network...');
                expect(progressEvents[1]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[1].body as any).message).to.equal('Packaging Project...');
                expect(progressEvents[2]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[2].body as any).message).to.equal('Connecting to debug server...');
                expect(progressEvents[3]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[3].body as any).message).to.equal('Configuring breakpoints...');
                expect(progressEvents[4]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[4].body as any).message).to.equal('Uploading to Roku...');
                expect(progressEvents[5]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[5].body as any).message).to.equal('Waiting on application...');
            });

            it('all progress events share the same progressId', async function() {
                this.timeout(5000);
                setupLaunchStubs();
                session['initRequestArgs'].supportsProgressReporting = true;

                await session.launchRequest({} as any, launchConfiguration);

                const progressEvents = getProgressEvents();
                expect(progressEvents.length).to.be.greaterThan(0);
                const progressId = progressEvents[0].body.progressId;
                expect(progressId).to.be.a('string').and.not.be.empty;
                for (const event of progressEvents) {
                    expect(event.body.progressId).to.equal(progressId);
                }
            });

            it('ends progress with abort message when publish throws a CompileError', async function() {
                this.timeout(5000);
                setupLaunchStubs();
                // Override the publish stub to throw a CompileError
                (session as any).publish.restore();
                sinon.stub(session as any, 'publish').rejects(new CompileError('compile failed', [], {} as any));
                session['initRequestArgs'].supportsProgressReporting = true;

                await session.launchRequest({} as any, launchConfiguration);
                await (session as any).configurationDoneRequest({} as any, {} as any);

                const progressUpdateEvents = events.filter(e => e instanceof ProgressUpdateEvent);
                const abortEvent = progressUpdateEvents.find(e => (e.body as any).message === 'Aborted (compile error)');
                expect(abortEvent).to.exist;
                expect(session['launchProgressId']).to.be.undefined;
            });

            it('sends no progress events when client does not support progress reporting', async function() {
                this.timeout(5000);
                setupLaunchStubs();
                session['initRequestArgs'].supportsProgressReporting = false;

                await session.launchRequest({} as any, launchConfiguration);

                expect(getProgressEvents()).to.be.empty;
            });
        });

        describe('library reference postfixing lifecycle', () => {
            /**
             * Stub the postfixing and zipping phases so each records a marker when it runs, then run the launch
             * flow (launchRequest stages; the package phase runs in configurationDoneRequest) and return the
             * recorded order. The write/postfix phases resolve on a later tick so the test proves the `Library`
             * rewrite truly waits for BOTH write/postfix branches to finish.
             */
            async function recordPhaseOrder() {
                const order: string[] = [];
                sinon.stub(util, 'dnsLookup').callsFake((host) => Promise.resolve(host));
                sinon.stub(rokuDeploy, 'getDeviceInfo').resolves({ developerEnabled: true } as any);
                sinon.stub(session, 'initRendezvousTracking').resolves();
                sinon.stub(session as any, 'createRokuAdapter').callsFake(() => { });
                sinon.stub(session as any, 'runAutomaticSceneGraphCommands').resolves();
                sinon.stub(session as any, 'tryProfilingConnectOnStart').resolves();
                sinon.stub(session.rokuDeploy, 'pressHomeButton').resolves();
                sinon.stub(session as any, 'publish').resolves();
                sinon.stub(session, 'setupProcessErrorHandlers');
                //staging is a no-op for this test; we care about the write/postfix -> rewrite -> zip ordering
                sinon.stub(session, 'prepareMainProject').resolves();
                sinon.stub(session as any, 'prepareComponentLibraries').resolves();
                rokuAdapter.connected = true;

                //write+postfix phases: resolve on a later tick so a missing barrier would let the rewrite sneak in early
                sinon.stub(session as any, 'writeMainProjectBreakpoints').callsFake(async () => {
                    await util.sleep(20);
                    order.push('postfix:main');
                });
                sinon.stub(session as any, 'writeAndPostfixComponentLibraries').callsFake(async () => {
                    await util.sleep(10);
                    order.push('postfix:complibs');
                });
                //the cross-project `Library` rewrite - must run AFTER all postfixing, BEFORE any zipping
                sinon.stub(session.projectManager, 'applyLibraryReferencePostfixes').callsFake(() => {
                    order.push('rewrite');
                    return Promise.resolve();
                });
                //zip/upload phases - must run AFTER the rewrite
                sinon.stub(session as any, 'zipMainProject').callsFake(() => {
                    order.push('zip:main');
                    return Promise.resolve();
                });
                sinon.stub(session as any, 'zipAndHostComponentLibraries').callsFake(() => {
                    order.push('zip:complibs');
                    return Promise.resolve();
                });

                //launchRequest stages the projects; configurationDoneRequest runs the package phase
                //(write/postfix -> rewrite -> zip) that this test asserts the ordering of
                await session.launchRequest({} as any, launchConfiguration);
                await (session as any).configurationDoneRequest({} as any, {} as any);
                return order;
            }

            it('rewrites `Library` references only after ALL projects are postfixed, and before any zipping', async function() {
                this.timeout(5000);
                const order = await recordPhaseOrder();

                const rewriteIndex = order.indexOf('rewrite');
                //both write/postfix phases complete before the rewrite starts
                expect(order.indexOf('postfix:main')).to.be.lessThan(rewriteIndex);
                expect(order.indexOf('postfix:complibs')).to.be.lessThan(rewriteIndex);
                //all zipping/uploading happens after the rewrite
                expect(order.indexOf('zip:main')).to.be.greaterThan(rewriteIndex);
                expect(order.indexOf('zip:complibs')).to.be.greaterThan(rewriteIndex);
            });
        });

        it('runs initializeProfiling after InitializedEvent so the extension does not clear profiling context keys on session start', async function() {
            this.timeout(5000);
            setupLaunchStubs();

            const calls: string[] = [];
            sinon.stub(session, 'sendEvent').callsFake((event) => {
                calls.push(`sendEvent:${event.constructor.name}`);
            });
            sinon.stub(session as any, 'initializeProfiling').callsFake(() => {
                calls.push('initializeProfiling');
                return Promise.resolve();
            });

            await session.launchRequest({} as any, launchConfiguration);

            const initializedIdx = calls.indexOf('sendEvent:InitializedEvent');
            const profilingIdx = calls.indexOf('initializeProfiling');
            expect(initializedIdx, 'InitializedEvent was not sent').to.be.greaterThan(-1);
            expect(profilingIdx, 'initializeProfiling was not called').to.be.greaterThan(-1);
            expect(profilingIdx, 'initializeProfiling must run after InitializedEvent').to.be.greaterThan(initializedIdx);
        });
    });

    describe('publish', () => {
        it('waits 60 seconds before aborting when the app never becomes ready', async () => {
            session['publishTimeout'] = 60_000;

            const clock = sinon.useFakeTimers();
            const shutdownStub = sinon.stub(session, 'shutdown').resolves() as unknown as SinonStub;
            rokuAdapter.connected = false;
            sinon.stub(session.rokuDeploy, 'publish').resolves();

            const publishPromise = (session as any).publish();

            await clock.tickAsync(59_999);
            expect(shutdownStub.called).to.be.false;

            await clock.tickAsync(1);
            await publishPromise;

            expect(shutdownStub.calledOnceWithExactly('Debug session cancelled: failed to connect to debug protocol control port.')).to.be.true;
            clock.restore();
        });
    });

    describe('threadsRequest', () => {
        beforeEach(() => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);
        });

        async function getThreadsResponse() {
            const response = { body: undefined } as DebugProtocol.ThreadsResponse;
            await session['threadsRequest'](response);
            return response;
        }

        it('returns empty thread list when not at debugger prompt', async () => {
            rokuAdapter.isAtDebuggerPrompt = false;
            const response = await getThreadsResponse();
            expect(response.body.threads).to.eql([]);
        });

        it('names normal threads without a suffix', async () => {
            rokuAdapter.isAtDebuggerPrompt = true;
            sinon.stub(rokuAdapter, 'getThreads').returns(Promise.resolve([
                { threadId: 0, isSelected: true, isDetached: false, lineNumber: 1, filePath: '', functionName: '', lineContents: '' }
            ]));
            const response = await getThreadsResponse();
            expect(response.body.threads[0].name).to.equal('Thread 0');
        });

        it('appends [detached] to the name of detached threads', async () => {
            rokuAdapter.isAtDebuggerPrompt = true;
            sinon.stub(rokuAdapter, 'getThreads').returns(Promise.resolve([
                { threadId: 0, isSelected: true, isDetached: false, lineNumber: 1, filePath: '', functionName: '', lineContents: '' },
                { threadId: 1, isSelected: false, isDetached: true, lineNumber: 2, filePath: '', functionName: '', lineContents: '' }
            ]));
            const response = await getThreadsResponse();
            expect(response.body.threads[0].name).to.equal('Thread 0');
            expect(response.body.threads[1].name).to.equal('Thread 1 [detached]');
        });

        it('handles undefined isDetached as not detached', async () => {
            rokuAdapter.isAtDebuggerPrompt = true;
            sinon.stub(rokuAdapter, 'getThreads').returns(Promise.resolve([
                { threadId: 0, isSelected: true, isDetached: undefined, lineNumber: 1, filePath: '', functionName: '', lineContents: '' }
            ]));
            const response = await getThreadsResponse();
            expect(response.body.threads[0].name).to.equal('Thread 0');
        });
    });

    describe('getThreadName', () => {
        //small helper to build a Thread with only the fields getThreadName cares about, plus required filler fields
        function buildThread(overrides: Partial<AdapterThread>): AdapterThread {
            return {
                threadId: 0,
                isSelected: false,
                lineNumber: 1,
                filePath: '',
                functionName: '',
                lineContents: '',
                ...overrides
            };
        }

        function getThreadName(overrides: Partial<AdapterThread>) {
            return session['getThreadName'](buildThread(overrides));
        }

        //
        // "Thread {threadId}" branch: none of type/name/osThreadId present
        //
        describe('falls back to "Thread {threadId}" when type, name, and osThreadId are all missing', () => {
            it('uses the threadId', () => {
                expect(getThreadName({ threadId: 0 })).to.equal('Thread 0');
            });

            it('uses a nonzero threadId', () => {
                expect(getThreadName({ threadId: 7 })).to.equal('Thread 7');
            });

            it('treats explicit undefined fields as missing', () => {
                expect(getThreadName({ threadId: 3, type: undefined, name: undefined, osThreadId: undefined })).to.equal('Thread 3');
            });

            it('treats empty-string fields as missing (falsy)', () => {
                expect(getThreadName({ threadId: 4, type: '', name: '', osThreadId: '' })).to.equal('Thread 4');
            });

            it('appends [detached] when detached', () => {
                expect(getThreadName({ threadId: 2, isDetached: true })).to.equal('Thread 2 [detached]');
            });

            it('does not append [detached] when isDetached is false', () => {
                expect(getThreadName({ threadId: 2, isDetached: false })).to.equal('Thread 2');
            });

            it('does not append [detached] when isDetached is undefined', () => {
                expect(getThreadName({ threadId: 2, isDetached: undefined })).to.equal('Thread 2');
            });
        });

        //
        // "[type] name osThreadId" branch: at least one of type/name/osThreadId present.
        // Only the fields that are present are included; missing fields are omitted entirely
        // (no "undefined" tokens leak into the name).
        //
        describe('builds "[type] name osThreadId" from only the present fields', () => {
            it('all three present', () => {
                expect(getThreadName({ type: 'render', name: 'MainThread', osThreadId: '1234' })).to.equal('[render] MainThread 1234');
            });

            it('only type present', () => {
                expect(getThreadName({ type: 'render' })).to.equal('[render]');
            });

            it('only name present', () => {
                expect(getThreadName({ name: 'MainThread' })).to.equal('MainThread');
            });

            it('only osThreadId present', () => {
                expect(getThreadName({ osThreadId: '1234' })).to.equal('1234');
            });

            it('type and name present, osThreadId missing', () => {
                expect(getThreadName({ type: 'render', name: 'MainThread' })).to.equal('[render] MainThread');
            });

            it('type and osThreadId present, name missing', () => {
                expect(getThreadName({ type: 'render', osThreadId: '1234' })).to.equal('[render] 1234');
            });

            it('name and osThreadId present, type missing', () => {
                expect(getThreadName({ name: 'MainThread', osThreadId: '1234' })).to.equal('MainThread 1234');
            });

            it('appends [detached] when detached', () => {
                expect(getThreadName({ type: 'render', name: 'MainThread', osThreadId: '1234', isDetached: true })).to.equal('[render] MainThread 1234 [detached]');
            });

            it('appends [detached] even when only one field is present', () => {
                expect(getThreadName({ type: 'render', isDetached: true })).to.equal('[render] [detached]');
            });

            it('does not append [detached] when isDetached is false', () => {
                expect(getThreadName({ type: 'render', name: 'MainThread', osThreadId: '1234', isDetached: false })).to.equal('[render] MainThread 1234');
            });
        });

        //
        // whitespace normalization
        //
        describe('whitespace handling', () => {
            it('collapses internal whitespace within field values', () => {
                expect(getThreadName({ type: 'render', name: 'Main   Thread', osThreadId: '1234' })).to.equal('[render] Main Thread 1234');
            });

            it('collapses tabs and newlines in field values to single spaces', () => {
                expect(getThreadName({ type: 'render', name: 'Main\t\nThread', osThreadId: '1234' })).to.equal('[render] Main Thread 1234');
            });

            it('trims leading/trailing whitespace produced by field values', () => {
                //leading space inside type and trailing space in osThreadId get collapsed/trimmed
                expect(getThreadName({ type: ' render', name: 'MainThread', osThreadId: '1234 ' })).to.equal('[ render] MainThread 1234');
            });
        });
    });

    describe('setupSuspendedState', () => {
        beforeEach(() => {
            session.projectManager.mainProject = new Project({
                rootDir: rootDir,
                outDir: stagingDir
            } as Partial<AddProjectParams> as any);
            session.projectManager.mainProject.fileMappings = [];
            sinon.stub(rokuAdapter, 'syncBreakpoints').resolves();
        });

        it('does not crash when thread has corrupted filePath and failedDeletions is non-empty', async () => {
            sinon.stub(rokuAdapter, 'getThreads').resolves([{
                isSelected: true,
                filePath: 'Main',
                lineNumber: 1295673717,
                lineContents: '',
                threadId: 1
            }]);
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([{
                filePath: 'pkg:/components/Component.brs',
                lineNumber: 33,
                functionIdentifier: 'showSomething',
                frameId: 0
            }]);
            sinon.stub(session.projectManager, 'getSourceLocation').resolves({
                filePath: s`${rootDir}/components/Component.brs`,
                lineNumber: 33,
                columnIndex: 0
            });
            session.breakpointManager.failedDeletions.push({
                srcPath: s`${rootDir}/components/Component.brs`,
                line: 33
            } as any);

            // should not throw
            await session['setupSuspendedState']();
        });

        it('corrects thread.filePath from stack trace when lineNumber mismatch is detected', async () => {
            const getSourceLocationStub = sinon.stub(session.projectManager, 'getSourceLocation').resolves(undefined);
            sinon.stub(rokuAdapter, 'getThreads').resolves([{
                isSelected: true,
                filePath: 'Main',
                lineNumber: 1295673717,
                lineContents: '',
                threadId: 1
            }]);
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([{
                filePath: 'pkg:/components/Component.brs',
                lineNumber: 33,
                functionIdentifier: 'showSomething',
                frameId: 0
            }]);
            session.breakpointManager.failedDeletions.push({
                srcPath: s`${rootDir}/components/Component.brs`,
                line: 33
            } as any);

            await session['setupSuspendedState']();

            // getSourceLocation should have been called with the corrected pkg path, not 'Main'
            expect(getSourceLocationStub.args[0][0]).to.equal('pkg:/components/Component.brs');
        });

        it('does not crash when getSourceLocation returns undefined', async () => {
            sinon.stub(rokuAdapter, 'getThreads').resolves([{
                isSelected: true,
                filePath: 'pkg:/components/Component.brs',
                lineNumber: 33,
                lineContents: '',
                threadId: 1
            }]);
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([{
                filePath: 'pkg:/components/Component.brs',
                lineNumber: 33,
                functionIdentifier: 'showSomething',
                frameId: 0
            }]);
            sinon.stub(session.projectManager, 'getSourceLocation').resolves(undefined);
            session.breakpointManager.failedDeletions.push({
                srcPath: s`${rootDir}/components/Component.brs`,
                line: 33
            } as any);

            // should not throw even when getSourceLocation returns undefined
            await session['setupSuspendedState']();
        });

        it('does not crash when getStackTrace returns empty and failedDeletions is non-empty', async () => {
            // Thread has a valid filePath from getThreads() but getStackTrace returns empty.
            // The original filePath must be preserved (not clobbered with undefined) so the
            // failedDeletions loop can safely call getSourceLocation.
            const getSourceLocationStub = sinon.stub(session.projectManager, 'getSourceLocation').resolves(undefined);
            sinon.stub(rokuAdapter, 'getThreads').resolves([{
                isSelected: false,
                isDetached: false,
                filePath: 'pkg:/source/main.brs',
                lineNumber: 10,
                lineContents: '',
                threadId: 1
            }]);
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([]);
            session.breakpointManager.failedDeletions.push({
                srcPath: s`${rootDir}/source/main.brs`,
                line: 10
            } as any);

            // should not throw — filePath from getThreads() is preserved even when stack trace is empty
            await session['setupSuspendedState']();

            // getSourceLocation is called with the original filePath, not undefined
            expect(getSourceLocationStub.args[0][0]).to.equal('pkg:/source/main.brs');
        });

        it('calls getStackTrace for all threads including those already flagged isDetached by the device', async () => {
            // Even threads pre-flagged isDetached must go through getStackTrace so the adapter cache
            // is populated — otherwise stackTraceRequest would make a second round-trip and might
            // not show the [detached] label if the device returns something unexpected.
            const getStackTraceStub = sinon.stub(rokuAdapter, 'getStackTrace').resolves([]);
            sinon.stub(rokuAdapter, 'getThreads').resolves([
                { isSelected: true, isDetached: true, filePath: 'pkg:/source/main.brs', lineNumber: 1, lineContents: '', threadId: 0 },
                { isSelected: false, isDetached: false, filePath: 'pkg:/source/main.brs', lineNumber: 2, lineContents: '', threadId: 1 }
            ]);

            await session['setupSuspendedState']();

            expect(getStackTraceStub.callCount).to.equal(2);
        });

        it('returns all threads including detached ones so VS Code can display them', async () => {
            sinon.stub(rokuAdapter, 'getThreads').resolves([
                { isSelected: true, isDetached: false, filePath: 'pkg:/source/main.brs', lineNumber: 1, lineContents: '', threadId: 0 },
                { isSelected: false, isDetached: false, filePath: 'pkg:/source/main.brs', lineNumber: 2, lineContents: '', threadId: 1 }
            ]);
            sinon.stub(rokuAdapter, 'getStackTrace')
                .onFirstCall().resolves([{ filePath: 'pkg:/source/main.brs', lineNumber: 1, functionIdentifier: 'main', frameId: 0 }])
                .onSecondCall().resolves([]);

            const threads = await session['setupSuspendedState']();

            expect(threads).to.have.length(2);
        });

        it('does not clobber thread.filePath when line correction stack trace returns no frames', async () => {
            const threads = [{
                isSelected: true,
                isDetached: false,
                filePath: 'pkg:/source/main.brs',
                lineNumber: 10,
                lineContents: '',
                threadId: 0
            }];
            sinon.stub(rokuAdapter, 'getThreads').resolves(threads);
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([]);

            await session['setupSuspendedState']();

            // original filePath must be preserved — never overwritten with undefined
            expect(threads[0].filePath).to.equal('pkg:/source/main.brs');
        });
    });

    describe('stackTraceRequest', () => {
        beforeEach(() => {
            session['rokuAdapterDeferred'].resolve(session['rokuAdapter']);
            rokuAdapter.isAtDebuggerPrompt = true;
        });

        async function getStackTraceResponse(threadId: number) {
            const response = { body: undefined } as DebugProtocol.StackTraceResponse;
            await session['stackTraceRequest'](response, { threadId: threadId, startFrame: 0, levels: 20 });
            return response;
        }

        it('returns a label frame when getStackTrace returns empty (detached thread)', async () => {
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([]);

            const response = await getStackTraceResponse(0);

            expect(response.body.stackFrames).to.have.length(1);
            expect(response.body.stackFrames[0].presentationHint).to.equal('label');
            expect(response.body.stackFrames[0].name).to.equal('[unavailable]');
        });

        it('label frame for detached thread has no source', async () => {
            sinon.stub(rokuAdapter, 'getStackTrace').resolves([]);

            const response = await getStackTraceResponse(0);

            expect(response.body.stackFrames[0].source).to.be.undefined;
        });
    });
});
