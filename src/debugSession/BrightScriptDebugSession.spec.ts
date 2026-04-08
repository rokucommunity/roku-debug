import { expect } from 'chai';
import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as sinonActual from 'sinon';
import type { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import { DebugSession, Logger as DapLogger, logger as dapLogger, ProgressEndEvent, ProgressStartEvent, ProgressUpdateEvent } from '@vscode/debugadapter';
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
import { RendezvousTracker } from '../RendezvousTracker';
import { ClientToServerCustomEventName, isCustomRequestEvent, isProcessCrashEvent, LogOutputEvent } from './Events';
import { EventEmitter } from 'eventemitter3';
import type { EvaluateContainer } from '../adapters/DebugProtocolAdapter';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import { PerfettoManager } from '../PerfettoManager';

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
        } catch (e) {
            console.log(e);
        }
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

            //simulate "launch"
            await session.prepareMainProject();

            //remove the breakpoint
            args.breakpoints = [];
            await session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.be.lengthOf(0);

            //add breakpoint during live debug session. one was there before, the other is new. Neither will be verified right now
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

    describe('prepareAndHostComponentLibraries', () => {
        function stubDefaults() {
            sinon.stub(rokuDeploy, 'deleteAllComponentLibraries').resolves();
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'stage').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'fixMainProjectLibraryDependency').resolves();
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

            await session['prepareAndHostComponentLibraries']([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: true }
            ] as any, 8080);

            expect(installOrder).to.eql(['lib1.zip', 'lib2.zip']);
            expect(publishStub.callCount).to.equal(2);
        });

        it('skips libraries where install is not true', async () => {
            stubDefaults();
            const installOrder = [];
            const publishStub = sinon.stub(rokuDeploy, 'publish').callsFake(async (options) => {
                installOrder.push(options.outFile);
                await util.sleep(10);
                return { message: 'success', results: [] };
            });

            await session['prepareAndHostComponentLibraries']([
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

            await session['prepareAndHostComponentLibraries']([
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

        it('logs error when publish fails and includes lib index', async () => {
            stubDefaults();
            sinon.stub(rokuDeploy, 'publish').rejects(new Error('Network error'));

            await session['prepareAndHostComponentLibraries']([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true }
            ] as any, 8080);

            expect(errorSpy.calledWith('Error installing component library 0')).to.be.true;
        });

        it('waits for stage and zip before installing (slow lib1, fast lib2)', async () => {
            sinon.stub(rokuDeploy, 'deleteAllComponentLibraries').resolves();
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'fixMainProjectLibraryDependency').resolves();
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

            await session['prepareAndHostComponentLibraries']([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: true },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: true }
            ] as any, 8080);

            expect(events.indexOf('install-lib1.zip')).to.be.lessThan(events.indexOf('install-lib2.zip'));
            expect(events.indexOf('stage-end-lib1.zip')).to.be.lessThan(events.indexOf('install-lib1.zip'));
            expect(events.indexOf('zip-lib2.zip')).to.be.lessThan(events.indexOf('install-lib2.zip'));
        });

        it('fails build when complib promise fails', async () => {
            sinon.stub(rokuDeploy, 'deleteAllComponentLibraries').resolves();
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').resolves();
            session['launchConfiguration'].host = '192.168.1.100';
            session['launchConfiguration'].password = 'test123';

            sinon.stub(ComponentLibraryProject.prototype, 'stage').rejects(new Error('Stage failed'));

            let errorThrown = false;
            try {
                await session['prepareAndHostComponentLibraries']([
                    { rootDir: complib1Dir, outFile: 'lib1.zip', install: true }
                ] as any, 8080);
            } catch (e) {
                errorThrown = true;
                expect(e.message).to.include('Stage failed');
            }
            expect(errorThrown).to.be.true;
        });

        it('skips deleting complibs when none are marked install=true', async () => {
            const deleteStub = sinon.stub(rokuDeploy, 'deleteAllComponentLibraries').resolves();
            sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'stage').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'postfixFiles').resolves();
            sinon.stub(ComponentLibraryProject.prototype, 'zipPackage').resolves();

            await session['prepareAndHostComponentLibraries']([
                { rootDir: complib1Dir, outFile: 'lib1.zip', install: false },
                { rootDir: complib1Dir, outFile: 'lib2.zip', install: undefined }
            ] as any, 8080);

            expect(deleteStub.called).to.be.false;
        });

        it('does not start server when no component libraries present', async () => {
            const serverStub = sinon.stub(session['componentLibraryServer'], 'startStaticFileHosting').resolves();

            await session['prepareAndHostComponentLibraries']([], 8080);

            expect(serverStub.called).to.be.false;
        });

        it('calls packageTask for each component library if packageTask defined', async () => {
            stubDefaults();
            const sendEventStub = sinon.stub(session as any, 'sendCustomRequest').resolves();

            await session['prepareAndHostComponentLibraries']([
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

            await session['prepareAndHostComponentLibraries']([
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

    describe('completionsRequest', () => {
        describe('getClosestCompletionDetails', () => {
            it('handles empty string columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: '',
                    column: 0,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });
            });

            it('handles empty string columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: '',
                    column: 1,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });
            });

            it('handles bad variable path columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: '1bad.path',
                    column: 9,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);
            });

            it('handles bad variable path columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: '1bad.path',
                    column: 10,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);
            });

            it('handles simple input of just variable path columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'person.name',
                    column: 11,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });
            });

            it('handles simple input of just variable path columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'person.name',
                    column: 12,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });
            });

            it('handles simple input of just variable path with training period columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'person.name.',
                    column: 12,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person', 'name']
                });
            });

            it('handles simple input of just variable path with training period columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'person.name.',
                    column: 13,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person', 'name']
                });
            });

            it('handles simple input of just variable path columnsStartAt1 false but cursor is not at the end', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'person.name',
                    column: 9,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);
            });

            it('handles simple input of just variable path columnsStartAt1 true but cursor is not at the end', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'person.name',
                    column: 10,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);
            });

            it('returns undefined following closing brackets columnsStartAt1 false but cursor is not at the end', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'getPerson().name',
                    column: 16,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);

                expect(session['getClosestCompletionDetails']({
                    text: 'getPerson[0].name',
                    column: 17,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);
            });

            it('returns undefined following closing brackets columnsStartAt1 true but cursor is not at the end', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'getPerson().name',
                    column: 17,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);

                expect(session['getClosestCompletionDetails']({
                    text: 'getPerson[0].name',
                    column: 18,
                    line: undefined,
                    frameId: 0
                })).to.eql(undefined);
            });


            it('input after a open bracket columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name',
                    column: 20,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });

                expect(session['getClosestCompletionDetails']({
                    text: 'getValue[person.name',
                    column: 20,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });
            });

            it('input after a open bracket columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name',
                    column: 21,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });

                expect(session['getClosestCompletionDetails']({
                    text: 'getValue[person.name',
                    column: 21,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });
            });

            it('input after a open bracket with training closing bracket columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name)',
                    column: 20,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });
            });

            it('input after a open bracket with training closing bracket columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name)',
                    column: 21,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });
            });

            it('input after a open bracket with training closing bracket columnsStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name, test)',
                    column: 26,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });

                expect(session['getClosestCompletionDetails']({
                    text: 'getValue[person.name, test]',
                    column: 26,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });
            });

            it('input after a open bracket with training closing bracket columnsStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name, test)',
                    column: 27,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });

                expect(session['getClosestCompletionDetails']({
                    text: 'getValue[person.name, test]',
                    column: 27,
                    line: undefined,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });
            });

            it('handles multiline inout columnsStartAt1 false linesStartAt1 false', () => {
                session['_clientColumnsStartAt1'] = false;
                session['_clientLinesStartAt1'] = false;

                // cursor is on the first line
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name, {\ntemp: test\n})',
                    column: 20,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });

                // cursor is on the second line
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name, {\ntemp: test\n})',
                    column: 10,
                    line: 1,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });
            });

            it('handles multiline inout columnsStartAt1 true linesStartAt1 true', () => {
                session['_clientColumnsStartAt1'] = true;
                session['_clientLinesStartAt1'] = true;

                // cursor is on the first line
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name, {\ntemp: test\n})',
                    column: 21,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['person']
                });

                // cursor is on the second line
                expect(session['getClosestCompletionDetails']({
                    text: 'getValue(person.name, {\ntemp: test\n})',
                    column: 11,
                    line: 2,
                    frameId: 0
                })).to.eql({
                    parentVariablePath: ['']
                });

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
            sinon.stub(session as any, 'prepareAndHostComponentLibraries').resolves();
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

                const progressEvents = getProgressEvents();
                expect(progressEvents).to.have.lengthOf(3);
                expect(progressEvents[0]).to.be.instanceOf(ProgressStartEvent);
                expect((progressEvents[0].body as any).message).to.equal('Packaging...');
                expect(progressEvents[1]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[1].body as any).message).to.equal('Uploading to Roku...');
                expect(progressEvents[2]).to.be.instanceOf(ProgressUpdateEvent);
                expect((progressEvents[2].body as any).message).to.equal('Waiting on application...');
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
