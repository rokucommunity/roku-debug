import { expect } from 'chai';
import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as sinonActual from 'sinon';
import type { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { DebugSession } from 'vscode-debugadapter';
import { BrightScriptDebugSession } from './BrightScriptDebugSession';
import { fileUtils } from '../FileUtils';
import type { EvaluateContainer, StackFrame, TelnetAdapter } from '../adapters/TelnetAdapter';
import { PrimativeType } from '../adapters/TelnetAdapter';
import { defer } from '../util';
import { HighLevelType } from '../interfaces';
import type { LaunchConfiguration } from '../LaunchConfiguration';
import type { SinonStub } from 'sinon';
import { util as bscUtil, standardizePath as s } from 'brighterscript';
import { DefaultFiles } from 'roku-deploy';
import type { AddProjectParams, ComponentLibraryConstructorParams } from '../managers/ProjectManager';
import { ComponentLibraryProject, Project } from '../managers/ProjectManager';

const sinon = sinonActual.createSandbox();
const tempDir = s`${__dirname}/../../.tmp`;
const rootDir = s`${tempDir}/rootDir`;
const outDir = s`${tempDir}/outDir`;
const stagingDir = s`${outDir}/stagingDir`;
const complib1Dir = s`${tempDir}/complib1`;

describe('BrightScriptDebugSession', () => {
    let responseDeferreds = [];
    let responses = [];

    let session: BrightScriptDebugSession;

    let launchConfiguration: LaunchConfiguration;
    let initRequestArgs: DebugProtocol.InitializeRequestArguments;

    let rokuAdapter: TelnetAdapter;
    let errorSpy: sinon.SinonSpy;

    beforeEach(() => {
        fsExtra.emptydirSync(tempDir);
        sinon.restore();

        //stub the DebugSession shutdown call so it doesn't kill the test session
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
            stagingFolderPath: stagingDir,
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
            on: () => {
                return () => {
                };
            },
            activate: () => Promise.resolve(),
            registerSourceLocator: (a, b) => { },
            setConsoleOutput: (a) => { },
            evaluate: () => { },
            syncBreakpoints: () => { },
            getVariable: () => { },
            getScopeVariables: (a) => { },
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

    describe('evaluateRequest', () => {
        it('resets local var counter on suspend', async () => {
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
            expect(stub.getCall(0).firstArg).to.eql(`${session.tempVarPrefix}eval = []`);
            expect(stub.getCall(1).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 1+2`);
            expect(stub.getCall(2).firstArg).to.eql(`${session.tempVarPrefix}eval[1] = 2+3`);
            await session['onSuspend']();
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '3+4', frameId: 1 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(3).firstArg).to.eql(`${session.tempVarPrefix}eval = []`);
            expect(stub.getCall(4).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 3+4`);
        });

        it('can assign to a variable', async () => {
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
            expect(stub.getCall(0).firstArg).to.eql(`${session.tempVarPrefix}eval = []`);
            expect(stub.getCall(1).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 1+2`);
            await session.evaluateRequest(
                {} as DebugProtocol.EvaluateResponse,
                { context: 'repl', expression: '2+3', frameId: 2 } as DebugProtocol.EvaluateArguments
            );
            expect(stub.getCall(2).firstArg).to.eql(`${session.tempVarPrefix}eval = []`);
            expect(stub.getCall(3).firstArg).to.eql(`${session.tempVarPrefix}eval[0] = 2+3`);
        });
    });

    describe('variablesRequest', () => {
        it('hides debug local variables', async () => {
            const stub = sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
                return Promise.resolve({ type: 'message', message: '' });
            });
            sinon.stub(rokuAdapter, 'getScopeVariables').callsFake(() => {
                return Promise.resolve(['m', 'top', `${session.tempVarPrefix}eval`]);
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
                { variablesReference: 1000, filter: 'named', start: 0, count: 0, format: '' } as DebugProtocol.VariablesArguments
            );

            expect(
                response.body.variables.find(x => x.name.startsWith(session.tempVarPrefix))
            ).to.not.exist;

            session['launchConfiguration'].showHiddenVariables = true;
            await session.variablesRequest(
                response,
                { variablesReference: 1000, filter: 'named', start: 0, count: 0, format: '' } as DebugProtocol.VariablesArguments
            );
            expect(
                response.body.variables.find(x => x.name.startsWith(session.tempVarPrefix))
            ).to.exist;
        });

        it('hides debug children variables', async () => {
            const stub = sinon.stub(session['rokuAdapter'], 'evaluate').callsFake(x => {
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
                        name: '[[count]]',
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

    describe('initializeRequest', () => {
        it('does not throw', () => {
            assert.doesNotThrow(() => {
                session.initializeRequest({} as DebugProtocol.InitializeResponse, {} as DebugProtocol.InitializeRequestArguments);
            });
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
                stagingFolderPath: stagingDir
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
                stagingFolderPath: 'stagingPathA'
            };
            session.projectManager.componentLibraryProjects.push(<any>{
                stagingFolderPath: 'stagingPathB'
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
    });

    describe('handleDiagnostics', () => {
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
                range: bscUtil.createRange(1, 2, 3, 4)
            }]);
            expect(stub.getCall(0).args[0]?.body).to.eql({
                diagnostics: [{
                    message: 'Crash',
                    path: s`${stagingDir}/.roku-deploy-staging/components/SomeComponent.xml`,
                    range: bscUtil.createRange(1, 2, 1, 4)
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
                        stagingFolderPath: stagingDir,
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
    });
});
