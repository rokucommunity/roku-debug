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
import { standardizePath as s } from 'brighterscript';
import type { ComponentLibraryConstructorParams, AddProjectParams } from '../managers/ProjectManager';
import { ComponentLibraryProject, Project } from '../managers/ProjectManager';
import Sinon = require('sinon');

const sinon = sinonActual.createSandbox();
const tempDir = s`${__dirname}/../../.tmp`;
const rootDir = s`${tempDir}/rootDir}`;
const outDir = s`${tempDir}/outDir`;
const stagingDir = s`${outDir}/stagingDir`;
const complib1Dir = s`${tempDir}/complib1`;

describe('BrightScriptDebugSession', () => {
    let responseDeferreds = [];
    let responses = [];

    afterEach(() => {
        fsExtra.removeSync(outDir);
        sinon.restore();
    });

    let session: BrightScriptDebugSession;

    let launchConfiguration: LaunchConfiguration;
    let initRequestArgs: DebugProtocol.InitializeRequestArguments;

    let rokuAdapter: TelnetAdapter;
    let errorSpy: Sinon.SinonSpy;

    beforeEach(() => {
        sinon.restore();

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
        launchConfiguration = {} as any;
        session['launchConfiguration'] = launchConfiguration;
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
            getVariable: () => { },
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
        let args;
        beforeEach(() => {
            response = undefined;
            //intercept the sent response
            session.sendResponse = (res) => {
                response = res;
            };

            args = {
                source: {
                    path: path.normalize(`${rootDir}/dest/some/file.brs`)
                },
                breakpoints: []
            };
        });

        it('returns correct results', () => {
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints[0]).to.deep.include({
                line: 1,
                verified: true
            });

            //mark debugger as 'launched' which should change the behavior of breakpoints.
            session.breakpointManager.lockBreakpoints();

            //remove the breakpoint breakpoint (it should not remove the breakpoint because it was already verified)
            args.breakpoints = [];
            session.setBreakPointsRequest(<any>{}, args);
            expect(response.body.breakpoints).to.be.lengthOf(0);

            //add breakpoint during live debug session. one was there before, the other is new. Only one will be verified
            args.breakpoints = [{ line: 1 }, { line: 2 }];
            session.setBreakPointsRequest(<any>{}, args);
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

        it('supports breakpoints within xml files', () => {
            args.source.path = `${rootDir}/some/xml-file.xml`;
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
            //breakpoint should be disabled
            expect(response.body.breakpoints[0]).to.deep.include({ line: 1, verified: true });
        });

        it('handles breakpoints for non-brightscript files', () => {
            args.source.path = `${rootDir}/some/xml-file.jpg`;
            args.breakpoints = [{ line: 1 }];
            session.setBreakPointsRequest(<any>{}, args);
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
        it('erases all staging folders when configured to do so', () => {
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
            //stub the super shutdown call so it doesn't kill the test session
            sinon.stub(DebugSession.prototype, 'shutdown').returns(null);

            session.shutdown();
            expect(stub.callCount).to.equal(2);
            expect(stub.args.map(x => x[0])).to.eql([
                'stagingPathA',
                'stagingPathB'
            ]);
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
            await expectResponse({
                expression: `"Billy`,
                context: 'hover'
            }, {
                result: 'invalid',
                variablesReference: 0
            });
            console.log('checking calls');
            expect(evalStub.getCall(0)?.args[0]).equal('"Billy"');
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
