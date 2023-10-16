import type { BSDebugDiagnostic } from './CompileErrorProcessor';
import { CompileErrorProcessor, CompileStatus } from './CompileErrorProcessor';
import { expect } from 'chai';
import type { SinonFakeTimers } from 'sinon';
import { createSandbox } from 'sinon';
import { DiagnosticSeverity, util as bscUtil } from 'brighterscript';
import dedent = require('dedent');
const sinon = createSandbox();

describe('CompileErrorProcessor', () => {
    let compiler: CompileErrorProcessor;

    beforeEach(() => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        sinon.stub(console, 'debug').callsFake((...args) => { });
        compiler = new CompileErrorProcessor();
        compiler.compileErrorTimeoutMs = 1;
    });

    afterEach(() => {
        sinon.restore();
        compiler.destroy();
        compiler = undefined;
    });

    describe('events', () => {
        let clock: SinonFakeTimers;
        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('it allows unsubscribing', () => {
            let count = 0;
            const unobserve = compiler.on('diagnostics', () => {
                count++;
                unobserve();
            });
            compiler['emit']('diagnostics');
            compiler['emit']('diagnostics');

            clock.tick(200);
            expect(count).to.eql(1);
        });

        it('does not throw when emitter is destroyed', () => {
            const unobserve = compiler.on('diagnostics', () => { });
            delete compiler['emitter'];
            unobserve();
            compiler['emit']('diagnostics');
            clock.tick(200);
            //test passes because no exception was thrown
        });

        it('skips emitting the event when there are zero errros', () => {
            let callCount = 0;
            const unobserve = compiler.on('diagnostics', () => {
                callCount++;
            });
            compiler['reportErrors']();
            clock.tick(200);
            expect(callCount).to.equal(0);
        });

        it('excludes diagnostics that are missing a path', () => {
            sinon.stub(compiler as any, 'processMultiLineErrors').returns({});
            expect(
                compiler.getErrors([''])
            ).to.eql([]);
        });

        describe('sendErrors', () => {
            it('emits the errors', async () => {
                compiler.processUnhandledLines(dedent`
                    10-05 18:03:33.677 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)
                    10-05 18:03:33.679 [scrpt.cmpl] Compiling 'app', id 'dev'
                    10-05 18:03:33.681 [scrpt.load.mkup] Loading markup dev 'app'
                    10-05 18:03:33.681 [scrpt.unload.mkup] Unloading markup dev 'app'
                    10-05 18:03:33.683 [scrpt.parse.mkup.time] Parsed markup dev 'app' in 1 milliseconds

                    ------ Compiling dev 'app' ------

                    =================================================================
                    Found 1 compile error
                    --- Syntax Error. (compile error &h02) in pkg:/components/MainScene.brs(3)
                    *** ERROR compiling MainScene:


                    =================================================================
                    An error occurred while attempting to compile the application's components:
                    -------> Compilation Failed.
                    MainScene
                `);
                let callCount = 0;
                compiler.on('diagnostics', () => {
                    callCount++;
                });
                let promise = compiler.sendErrors();
                clock.tick(1000);
                await promise;
                expect(callCount).to.eql(1);

            });
        });
    });

    describe('parseGenericXmlError ', () => {
        it('handles empty line', () => {
            expect(
                compiler.getErrors([``])
            ).to.eql([]);
        });

        it('handles non match', () => {
            expect(
                compiler.getErrors(['some other output'])
            ).to.eql([]);
        });

        it('handles multi-line non match no match multiline', () => {
            expect(
                compiler.getErrors([`multiline text`, `with no match`])
            ).to.eql([]);
        });

        it('matches relative xml path', () => {
            expect(
                compiler.getErrors([`-------> Error parsing XML component SimpleButton.xml`])
            ).to.eql([{
                path: 'SimpleButton.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('matches absolute xml path', () => {
            expect(
                compiler.getErrors([`-------> Error parsing XML component pkg:/components/SimpleButton.xml`])
            ).to.eql([{
                path: 'pkg:/components/SimpleButton.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });
    });

    it('handles when the next line is missing', () => {
        expect(
            compiler.getErrors([
                `Error in XML component RedButton defined in file pkg:/components/RedButton.xml`
                //normally there's another line here, containing something like `-- Extends type does not exist: "ColoredButton"`.
                //This test omits it on purpose to make sure we can still detect an error
            ])
        ).to.eql([{
            range: bscUtil.createRange(0, 0, 0, 999),
            message: 'Error in XML component RedButton',
            path: 'pkg:/components/RedButton.xml',
            code: undefined,
            severity: DiagnosticSeverity.Error
        }]);
    });

    describe('parseSyntaxAndCompileErrors', () => {
        it('works with standard message', () => {
            expect(
                compiler.getErrors([`--- Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error &h92) in Parsers.brs(19) 'BAD_BS_CONST'`])
            ).to.eql([{
                path: 'Parsers.brs',
                range: bscUtil.createRange(18, 0, 18, 999),
                message: `Invalid #If/#ElseIf expression (<CONST-NAME> not defined) 'BAD_BS_CONST'`,
                code: '&h92',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('works with zero leading junk', () => {
            expect(
                compiler.getErrors([`Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error &h92) in Parsers.brs(19) 'BAD_BS_CONST'`])
            ).to.eql([{
                path: 'Parsers.brs',
                range: bscUtil.createRange(18, 0, 18, 999),
                message: `Invalid #If/#ElseIf expression (<CONST-NAME> not defined) 'BAD_BS_CONST'`,
                code: '&h92',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('works when missing trailing context', () => {
            expect(
                compiler.getErrors([`--- Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error &h92) in Parsers.brs(19)`])
            ).to.eql([{
                path: 'Parsers.brs',
                range: bscUtil.createRange(18, 0, 18, 999),
                message: `Invalid #If/#ElseIf expression (<CONST-NAME> not defined)`,
                code: '&h92',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('works when missing line number', () => {
            expect(
                compiler.getErrors([`--- Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error &h92) in Parsers.brs() 'BAD_BS_CONST'`])
            ).to.eql([{
                path: 'Parsers.brs',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Invalid #If/#ElseIf expression (<CONST-NAME> not defined) 'BAD_BS_CONST'`,
                code: '&h92',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('works when missing error code', () => {
            expect(
                compiler.getErrors([`--- Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error  ) in Parsers.brs(19) 'BAD_BS_CONST'`])
            ).to.eql([{
                path: 'Parsers.brs',
                range: bscUtil.createRange(18, 0, 18, 999),
                message: `Invalid #If/#ElseIf expression (<CONST-NAME> not defined) 'BAD_BS_CONST'`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });
    });

    describe('getMultipleFileXmlError ', () => {
        it('matches 1 relative file', () => {
            expect(
                compiler.getErrors([`-------> Error parsing multiple XML components (SimpleEntitlements.xml)`])
            ).to.eql([{
                path: 'SimpleEntitlements.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('matches 2 relative files', () => {
            expect(
                compiler.getErrors([`-------> Error parsing multiple XML components (SimpleEntitlements.xml, Otherfile.xml)`])
            ).to.eql([{
                path: 'SimpleEntitlements.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }, {
                path: 'Otherfile.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('matches 1 absolute file', () => {
            expect(
                compiler.getErrors([`-------> Error parsing multiple XML components (pkg:/components/SimpleEntitlements.xml)`])
            ).to.eql([{
                path: 'pkg:/components/SimpleEntitlements.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('matches 2 absolute files', () => {
            expect(
                compiler.getErrors([`-------> Error parsing multiple XML components (pkg:/components/SimpleEntitlements.xml, pkg:/components/Otherfile.xml)`])
            ).to.eql([{
                path: 'pkg:/components/SimpleEntitlements.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }, {
                path: 'pkg:/components/Otherfile.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('match 2 files amongst other stuff', () => {
            expect(
                compiler.getErrors([
                    `some other output`,
                    `some other output2`,
                    `-------> Error parsing multiple XML components (SimpleEntitlements.xml, Otherfile.xml)`,
                    `some other output3`
                ])
            ).to.eql([{
                path: 'SimpleEntitlements.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }, {
                path: 'Otherfile.xml',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: `Error parsing XML component`,
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });
    });

    it('ignores livecompile errors', () => {
        expect(
            compiler.getErrors([
                `------ Compiling dev 'sampleApp' ------`,
                `=================================================================`,
                `Found 1 compile error in file tmp/plugin/IJBAAAfijvb8/pkg:/components/Scene/MainScene.GetConfigurationw.brs`,
                `--- Error loading file. (compile error &hb9) in pkg:/components/Scene/MainScene.GetConfigurationw.brs`,
                `A block (such as FOR/NEXT or IF/ENDIF) was not terminated correctly. (compile error &hb5) in $LIVECOMPILE(1190)`,
                `BrightScript Debugger> while True`
            ])
        ).to.eql([{
            range: bscUtil.createRange(0, 0, 0, 999),
            message: 'Error loading file',
            path: 'pkg:/components/Scene/MainScene.GetConfigurationw.brs',
            code: '&hb9',
            severity: DiagnosticSeverity.Error
        }]);
    });

    describe('processUnhandledLines', () => {
        async function runTest(lines: string | string[], expectedStatus: CompileStatus, expectedErrors?: BSDebugDiagnostic[]) {
            let compileErrors: BSDebugDiagnostic[];
            let promise: Promise<any>;
            if (expectedErrors) {
                promise = new Promise<void>((resolve) => {
                    compiler.on('diagnostics', (errors) => {
                        compileErrors = errors;
                        resolve();
                    });
                });
            }

            if (typeof lines === 'string') {
                compiler.processUnhandledLines(lines);
            } else {
                for (const line of lines) {
                    compiler.processUnhandledLines(line);
                }
            }

            if (expectedErrors) {
                //wait for the compiler-errors event
                await promise;
                expect(compileErrors).to.eql(expectedErrors);
            }
            expect(compiler.status).to.eql(expectedStatus);
        }

        it('handles the data in large chunks', async () => {
            await runTest(dedent`
                10-05 18:03:33.677 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)
                10-05 18:03:33.679 [scrpt.cmpl] Compiling 'app', id 'dev'
                10-05 18:03:33.681 [scrpt.load.mkup] Loading markup dev 'app'
                10-05 18:03:33.681 [scrpt.unload.mkup] Unloading markup dev 'app'
                10-05 18:03:33.683 [scrpt.parse.mkup.time] Parsed markup dev 'app' in 1 milliseconds

                ------ Compiling dev 'app' ------

                =================================================================
                Found 1 compile error
                --- Syntax Error. (compile error &h02) in pkg:/components/MainScene.brs(3)
                *** ERROR compiling MainScene:


                =================================================================
                An error occurred while attempting to compile the application's components:
                -------> Compilation Failed.
                MainScene
            `, CompileStatus.compileError, [{
                range: bscUtil.createRange(2, 0, 2, 999),
                message: 'Syntax Error',
                path: 'pkg:/components/MainScene.brs',
                code: '&h02',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('emits component library errors after initial compile is complete', async () => {
            await runTest(dedent`
                10-06 19:37:12.462 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0 ms)
                10-06 19:37:12.463 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)
                10-06 19:37:12.465 [scrpt.cmpl] Compiling 'app', id 'dev'
                10-06 19:37:12.466 [scrpt.load.mkup] Loading markup dev 'app'
                10-06 19:37:12.467 [scrpt.unload.mkup] Unloading markup dev 'app'
                10-06 19:37:12.468 [scrpt.parse.mkup.time] Parsed markup dev 'app' in 1 milliseconds

                ------ Compiling dev 'app' ------
                10-06 19:37:12.471 [scrpt.ctx.cmpl.time] Compiled 'app', id 'dev' in 2 milliseconds (BCVer:0)
                10-06 19:37:12.471 [scrpt.proc.mkup.time] Processed markup dev 'app' in 0 milliseconds
                10-06 19:37:12.481 [beacon.signal] |AppCompileComplete --------> Duration(18 ms)
                10-06 19:37:12.498 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0 ms)
                10-06 19:37:12.508 [beacon.signal] |AppSplashInitiate ---------> TimeBase(9 ms)
                10-06 19:37:13.198 [beacon.signal] |AppSplashComplete ---------> Duration(690 ms)
                10-06 19:37:13.370 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0 ms)
                10-06 19:37:13.384 [scrpt.cmpl] Compiling 'app', id 'dev'
                10-06 19:37:13.391 [scrpt.load.mkup] Loading markup dev 'app'
                10-06 19:37:13.392 [scrpt.unload.mkup] Unloading markup dev 'app'
                10-06 19:37:13.394 [scrpt.parse.mkup.time] Parsed markup dev 'app' in 2 milliseconds

                ------ Compiling dev 'app' ------
                10-06 19:37:13.399 [scrpt.ctx.cmpl.time] Compiled 'app', id 'dev' in 4 milliseconds (BCVer:0)
                10-06 19:37:13.399 [scrpt.proc.mkup.time] Processed markup dev 'app' in 0 milliseconds
                10-06 19:37:13.400 [beacon.signal] |AppCompileComplete --------> Duration(28 ms)

                ------ Running dev 'app' main ------
                10-06 19:37:14.005 [scrpt.ctx.run.enter] UI: Entering 'app', id 'dev'
                Complib loadStatus:             loading
                10-06 19:37:14.212 [scrpt.cmpl] Compiling '', id 'RSG_BAAAAAJlSIgm'
                10-06 19:37:14.214 [scrpt.load.mkup] Loading markup RSG_BAAAAAJlSIgm ''
                10-06 19:37:14.215 [scrpt.unload.mkup] Unloading markup RSG_BAAAAAJlSIgm ''
                10-06 19:37:14.218 [scrpt.parse.mkup.time] Parsed markup RSG_BAAAAAJlSIgm '' in 4 milliseconds

                =================================================================
                Found 1 compile error
                contained in ComponentLibrary package with uri
                http://192.168.1.22:8080/complib.zip
                --- Syntax Error. (compile error &h02) in pkg:/components/RedditViewer__lib0.brs(4)
                *** ERROR compiling RedditViewer:
                10-06 19:37:14.505 [bs.ndk.proc.exit] plugin=dev pid=8755 status=signal retval=11 user requested=0 process name='SdkLauncher' exit code=EXIT_SYSTEM_KILL
                10-06 19:37:14.512 [beacon.signal] |AppExitInitiate -----------> TimeBase(2014 ms)
                10-06 19:37:14.514 [beacon.header] __________________________________________
                10-06 19:37:14.514 [beacon.report] |AppLaunchInitiate ---------> TimeBase(0 ms), InstantOn
                10-06 19:37:14.515 [beacon.report] |AppSplashInitiate ---------> TimeBase(9 ms)
                10-06 19:37:14.515 [beacon.report] |AppSplashComplete ---------> Duration(690 ms)
                10-06 19:37:14.515 [beacon.report] |AppExitInitiate -----------> TimeBase(2014 ms)
                10-06 19:37:14.515 [beacon.report] |AppExitComplete -----------> Duration(2 ms)
                10-06 19:37:14.515 [beacon.footer] __________________________________________
            `, CompileStatus.compileError, [{
                range: bscUtil.createRange(3, 0, 3, 999),
                message: 'Syntax Error',
                path: 'pkg:/components/RedditViewer__lib0.brs',
                code: '&h02',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('detects No errors', async () => {
            let lines = [
                `03-26 23:57:28.111 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-26 23:57:28.112 [beacon.signal] |AppCompileInitiate --------> TimeBase(1 ms)`,
                `03-26 23:57:28.112 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-26 23:57:28.140 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-26 23:57:28.168 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                `03-26 23:57:28.246 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 105 milliseconds`,
                ``,
                `------ Compiling dev 'sampleApp' ------`,
                `03-26 23:57:29.943 [scrpt.ctx.cmpl.time] Compiled 'sampleApp', id 'dev' in 1696 milliseconds`,
                `03-26 23:57:29.963 [scrpt.proc.mkup.time] Processed markup dev 'sampleApp' in 0 milliseconds`,
                `03-26 23:57:29.964 [beacon.signal] |AppCompileComplete --------> Duration(1852 ms), 2.46 MiP`,
                `03-26 23:57:29.975 [ui.frm.plugin.running.enter] Entering PLUGIN_RUNNING for dev`,
                `03-26 23:57:29.975 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-26 23:57:31.442 [scrpt.ctx.run.enter] UI: Entering 'sampleApp', id 'dev'`,
                ``,
                `------ Running dev 'sampleApp' main ------`,
                ``
            ];

            await runTest(lines, CompileStatus.running);
        });

        it('detects Error loading file', async () => {
            let lines = [
                `03-25 13:48:30.501 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0 ms)`,
                `03-25 13:48:30.501 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)`,
                `03-25 13:48:30.502 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-25 13:48:30.529 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-25 13:48:30.554 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                `03-25 13:48:30.610 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 81 milliseconds`,
                `------ Compiling dev 'sampleApp' ------`,
                `=================================================================`,
                `Found 1 compile error in file tmp/plugin/IJBAAAfijvb8/pkg:/components/Scene/MainScene.GetConfigurationw.brs`,
                `--- Error loading file. (compile error &hb9) in pkg:/components/Scene/MainScene.GetConfigurationw.brs`,
                ``,
                ``,
                `=================================================================`,
                `An error occurred while attempting to compile the application's components:`,
                `-------> Compilation Failed.`
            ];

            await runTest(lines, CompileStatus.compileError, [{
                range: bscUtil.createRange(0, 0, 0, 999),
                message: 'Error loading file',
                path: 'pkg:/components/Scene/MainScene.GetConfigurationw.brs',
                code: '&hb9',
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('detects multi-line syntax errors', async () => {
            await runTest([
                `08-25 19:03:56.531 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0 ms)`,
                `08-25 19:03:56.531 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)`,
                `08-25 19:03:56.531 [scrpt.cmpl] Compiling 'Hello World Console 2', id 'dev'`,
                `08-25 19:03:56.532 [scrpt.load.mkup] Loading markup dev 'Hello World Console 2'`,
                `08-25 19:03:56.532 [scrpt.unload.mkup] Unloading markup dev 'Hello World Console 2'`,
                `=================================================================`,
                `Found 3 parse errors in XML file Foo.xml`,
                `--- Line 2: Unexpected data found inside a <component> element (first 10 characters are "aaa")`,
                `--- Line 3: Some unique error message`,
                `--- Line 5: message with Line 4 inside it`,
                `08-25 19:03:56.536 [scrpt.parse.mkup.time] Parsed markup dev 'Hello World Console 2' in 4 milliseconds`,
                `------ Compiling dev 'Hello World Console 2' ------`,
                `BRIGHTSCRIPT: WARNING: unused variable 'person' in function 'main' in #130`,
                `BRIGHTSCRIPT: WARNING: unused variable 'arg1' in function 'noop' in #131`,
                `Displayed 2 of 2 warnings`,
                `08-25 19:03:56.566 [scrpt.ctx.cmpl.time] Compiled 'Hello World Console 2', id 'dev' in 29 milliseconds (BCVer:0)`,
                `08-25 19:03:56.567 [scrpt.unload.mkup] Unloading markup dev 'Hello World Console 2'`,
                `=================================================================`,
                `An error occurred while attempting to compile the application's components:`,
                `-------> Error parsing XML component Foo.xml`
            ], CompileStatus.compileError, [{
                range: bscUtil.createRange(1, 0, 1, 999),
                message: 'Unexpected data found inside a <component> element (first 10 characters are "aaa")',
                path: 'Foo.xml',
                code: undefined,
                severity: DiagnosticSeverity.Error
            }, {
                range: bscUtil.createRange(2, 0, 2, 999),
                message: 'Some unique error message',
                path: 'Foo.xml',
                code: undefined,
                severity: DiagnosticSeverity.Error
            }, {
                range: bscUtil.createRange(4, 0, 4, 999),
                message: 'message with Line 4 inside it',
                path: 'Foo.xml',
                code: undefined,
                severity: DiagnosticSeverity.Error
            }, {
                range: bscUtil.createRange(0, 0, 0, 999),
                message: 'Error parsing XML component',
                path: 'Foo.xml',
                code: undefined,
                severity: DiagnosticSeverity.Error
            }]);
        });

        it('detects XML syntax error', async () => {
            await runTest([
                `03-26 22:21:46.570 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-26 22:21:46.571 [beacon.signal] |AppCompileInitiate --------> TimeBase(1 ms)`,
                `03-26 22:21:46.571 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-26 22:21:46.599 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-26 22:21:46.624 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                ``,
                `=================================================================`,
                `Found 1 parse error in XML file SampleScreen.xml`,
                `--- Line 3: XML syntax error found ---> not well-formed (invalid token)`,
                `03-26 22:21:46.702 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 103 milliseconds`,
                ``,
                `------ Compiling dev 'sampleApp' ------`,
                `03-26 22:21:48.354 [scrpt.ctx.cmpl.time] Compiled 'sampleApp', id 'dev' in 1651 milliseconds`,
                `03-26 22:21:48.373 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                ``,
                ``,
                `=================================================================`,
                `An error occurred while attempting to compile the application's components:`,
                `-------> Error parsing XML component SampleScreen.xml`,
                ``,
                `[RAF] Roku_Ads Framework version 2.1231`
            ], CompileStatus.compileError, [
                {
                    range: bscUtil.createRange(2, 0, 2, 999),
                    message: 'XML syntax error found ---> not well-formed (invalid token)',
                    path: 'SampleScreen.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: 'Error parsing XML component',
                    path: 'SampleScreen.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }
            ]);
        });

        it('detects BRS syntax error', async () => {
            let lines = [
                `03-26 22:33:52.518 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-26 22:33:52.518 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)`,
                `03-26 22:33:52.518 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-26 22:33:52.549 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-26 22:33:52.578 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                `03-26 22:33:52.657 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 108 milliseconds`,
                `------ Compiling dev 'sampleApp' ------`,
                ``,
                `=================================================================`,
                `Found 5 compile errors in file tmp/plugin/NHAAAA5phFBS/pkg:/components/Services/Network/Parsers.brs`,
                `--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(595)`,
                `--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(598)`,
                `--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(732)`,
                `--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(733)`,
                `--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(734)`
            ];

            await runTest(lines, CompileStatus.compileError, [
                {
                    range: bscUtil.createRange(595 - 1, 0, 595 - 1, 999),
                    code: '&h02',
                    message: 'Syntax Error',
                    path: 'pkg:/components/Services/Network/Parsers.brs',
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(598 - 1, 0, 598 - 1, 999),
                    code: '&h02',
                    message: 'Syntax Error',
                    path: 'pkg:/components/Services/Network/Parsers.brs',
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(732 - 1, 0, 732 - 1, 999),
                    code: '&h02',
                    message: 'Syntax Error',
                    path: 'pkg:/components/Services/Network/Parsers.brs',
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(733 - 1, 0, 733 - 1, 999),
                    code: '&h02',
                    message: 'Syntax Error',
                    path: 'pkg:/components/Services/Network/Parsers.brs',
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(734 - 1, 0, 734 - 1, 999),
                    code: '&h02',
                    message: 'Syntax Error',
                    path: 'pkg:/components/Services/Network/Parsers.brs',
                    severity: DiagnosticSeverity.Error
                }
            ]);
        });

        it('detects Multiple XML syntax errors', async () => {
            let lines = [
                `03-26 23:14:06.361 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-26 23:14:06.361 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)`,
                `03-26 23:14:06.361 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-26 23:14:06.391 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-26 23:14:06.419 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                ``,
                `=================================================================`,
                `Found 1 parse error in XML file SampleScreen.xml`,
                `--- Line 3: XML syntax error found ---> not well-formed (invalid token)`,
                ``,
                `=================================================================`,
                `Error in XML component RedButton defined in file pkg:/components/RedButton.xml`,
                `-- Extends type does not exist: "ColoredButton"`,
                ``,
                `=================================================================`,
                `Found 1 parse error in XML file ChannelItemComponent.xml`,
                `--- Line 9: XML syntax error found ---> not well-formed (invalid token)`,
                `03-26 23:14:06.499 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 108 milliseconds`,
                ``,
                `------ Compiling dev 'sampleApp' ------`,
                `03-26 23:14:08.133 [scrpt.ctx.cmpl.time] Compiled 'sampleApp', id 'dev' in 1633 milliseconds`,
                `03-26 23:14:08.152 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                ``,
                `=================================================================`,
                `An error occurred while attempting to compile the application's components:`,
                `-------> Error parsing multiple XML components (SampleScreen.xml, ChannelItemComponent.xml, RedButton.xml)`
            ];

            await runTest(lines, CompileStatus.compileError, [
                {
                    range: bscUtil.createRange(2, 0, 2, 999),
                    message: 'XML syntax error found ---> not well-formed (invalid token)',
                    path: 'SampleScreen.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: 'Extends type does not exist: "ColoredButton"',
                    path: 'pkg:/components/RedButton.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(8, 0, 8, 999),
                    message: 'XML syntax error found ---> not well-formed (invalid token)',
                    path: 'ChannelItemComponent.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: 'Error parsing XML component',
                    path: 'SampleScreen.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: 'Error parsing XML component',
                    path: 'ChannelItemComponent.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }, {
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: 'Error parsing XML component',
                    path: 'RedButton.xml',
                    code: undefined,
                    severity: DiagnosticSeverity.Error
                }
            ]);
        });

        it('detects Invalid #If/#ElseIf expression', async () => {
            let lines = [
                `03-27 00:19:07.768 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-27 00:19:07.768 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)`,
                `03-27 00:19:07.768 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-27 00:19:07.797 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-27 00:19:07.824 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                `03-27 00:19:07.889 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 92 milliseconds`,
                ``,
                `------ Compiling dev 'sampleApp' ------`,
                ``,
                `=================================================================`,
                `Found 1 compile error in file tmp/plugin/NJAAAADUQ6eV/Parsers.brs(NaN)`,
                `--- Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error &h92) in Parsers.brs(19) 'BAD_BS_CONST'`
            ];

            await runTest(lines, CompileStatus.compileError, [
                {
                    code: '&h92',
                    range: bscUtil.createRange(19 - 1, 0, 19 - 1, 999),
                    message: `Invalid #If/#ElseIf expression (<CONST-NAME> not defined) 'BAD_BS_CONST'`,
                    path: 'Parsers.brs',
                    severity: DiagnosticSeverity.Error
                }
            ]);
        });

        it('detects No manifest', async () => {
            await runTest([
                `03-27 00:19:07.768 [beacon.signal] |AppLaunchInitiate ---------> TimeBase(0)`,
                `03-27 00:19:07.768 [beacon.signal] |AppCompileInitiate --------> TimeBase(0 ms)`,
                `03-27 00:19:07.768 [scrpt.cmpl] Compiling 'sampleApp', id 'dev'`,
                `03-27 00:19:07.797 [scrpt.load.mkup] Loading markup dev 'sampleApp'`,
                `03-27 00:19:07.824 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                `03-27 00:19:07.889 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 92 milliseconds`,
                ``,
                `------ Compiling dev 'sampleApp' ------`,
                ``,
                `=================================================================`,
                `An error occurred while attempting to install the application:`,
                ``,
                `------->No manifest. Invalid package.`
            ], CompileStatus.compileError, [
                {
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: 'No manifest. Invalid package',
                    path: 'pkg:/manifest',
                    severity: DiagnosticSeverity.Error,
                    code: undefined
                }
            ]);
        });

    });
});
