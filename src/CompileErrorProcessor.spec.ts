// tslint:disable: no-floating-promises
import { CompileErrorProcessor, BrightScriptDebugCompileError, CompileStatus } from './CompileErrorProcessor';
import { expect, assert } from 'chai';
import * as sinonImport from 'sinon';
var sinon = sinonImport.createSandbox();

describe('BrightScriptDebugger', () => {
    var compiler: CompileErrorProcessor;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args ) => {});
        sinon.stub(console, 'debug').callsFake((...args ) => {});
        compiler = new CompileErrorProcessor();
        compiler.compileErrorTimeoutMs = 1;
    });

    afterEach(() => {
        compiler = undefined;
        sinon.restore();
    });

    describe('getSingleFileXmlError ', () => {
        it('tests no input', () => {
            let input = [''];
            let errors = compiler.getSingleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match', () => {
            let input = ['some other output'];
            let errors = compiler.getSingleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match multiline', () => {
            let input = [`multiline text`, `with no match`];
            let errors = compiler.getSingleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('match', () => {
            let input = [`-------> Error parsing XML component SimpleEntitlements.xml`];
            let errors = compiler.getSingleFileXmlError(input);
            assert.lengthOf(errors, 1);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');
        });
    });

    describe('getMultipleFileXmlError ', () => {
        it('tests no input', () => {
            let input = [''];
            let errors = compiler.getMultipleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match', () => {
            let input = ['some other output'];
            let errors = compiler.getMultipleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('tests no match multiline', () => {
            let input = [`multiline text`, `with no match`];
            let errors = compiler.getMultipleFileXmlError(input);
            assert.isEmpty(errors);
        });

        it('match 1 file', () => {
            let input = [`-------> Error parsing multiple XML components (SimpleEntitlements.xml)`];
            let errors = compiler.getMultipleFileXmlError(input);
            assert.lengthOf(errors, 1);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');
        });

        it('match 2 files', () => {
            let input = [`-------> Error parsing multiple XML components (SimpleEntitlements.xml, Otherfile.xml)`];
            let errors = compiler.getMultipleFileXmlError(input);
            assert.lengthOf(errors, 2);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');

            let error2 = errors[1];
            assert.equal(error2.path, 'Otherfile.xml');
        });

        it('match 2 files amongst other stuff', () => {
            let input = [
                `some other output`,
                `some other output2`,
                `-------> Error parsing multiple XML components (SimpleEntitlements.xml, Otherfile.xml)`,
                `some other output3`
            ];
            let errors = compiler.getMultipleFileXmlError(input);
            assert.lengthOf(errors, 2);
            let error = errors[0];
            assert.equal(error.path, 'SimpleEntitlements.xml');

            let error2 = errors[1];
            assert.equal(error2.path, 'Otherfile.xml');
        });
    });

    describe('processUnhandledLines', () => {
        async function runTest(lines: string[], expectedStatus: CompileStatus, expectedErrors?: BrightScriptDebugCompileError[]) {
            let compileErrors: BrightScriptDebugCompileError[];
            let promise: Promise<any>;
            if (expectedErrors) {
                promise = new Promise((resolve) => {
                    compiler.on('compile-errors', (errors) => {
                        compileErrors = errors;
                        resolve();
                    });
                });
            }

            lines.forEach((line) => {
                compiler.processUnhandledLines(line);
            });

            if (expectedErrors) {
                //wait for the compiler-errors event
                await promise;
                expect(compileErrors).to.eql(expectedErrors);
            }
            expect(compiler.status).to.eql(expectedStatus);
        }

        it('detects No errors' , async () => {
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

        it('detects Error loading file' , async () => {
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

            let expectedErrors = [{
                charEnd: 999,
                charStart: 0,
                errorText: 'ERR_COMPILE:',
                lineNumber: 0,
                message: 'Found 1 compile error in file tmp/plugin/IJBAAAfijvb8/pkg:/components/Scene/MainScene.GetConfigurationw.brs\n--- Error loading file. (compile error &hb9) in pkg:/components/Scene/MainScene.GetConfigurationw.brs',
                path: 'pkg:/components/Scene/MainScene.GetConfigurationw.brs'
            }];

            await runTest(lines, CompileStatus.compileError, expectedErrors);
        });

        it('detects XML syntax error', async () => {
            let lines = [
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
            ];

            let expectedErrors = [
                {
                    charEnd: 999,
                    charStart: 0,
                    errorText: 'ERR_COMPILE:',
                    lineNumber: 2,
                    message: 'XML syntax error found ---> not well-formed (invalid token)',
                    path: 'SampleScreen.xml'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    errorText: 'ERR_COMPILE:',
                    lineNumber: 0,
                    message: 'general compile error in xml file',
                    path: 'SampleScreen.xml'
                }
            ];

            await runTest(lines, CompileStatus.compileError, expectedErrors);
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

            let expectedErrors = [
                {
                    charEnd: 999,
                    charStart: 0,
                    lineNumber: 594,
                    errorText: '--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(595)',
                    message: 'Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(595)',
                    path: 'pkg:/components/Services/Network/Parsers.brs'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    lineNumber: 597,
                    errorText: '--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(598)',
                    message: 'Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(598)',
                    path: 'pkg:/components/Services/Network/Parsers.brs'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    lineNumber: 731,
                    errorText: '--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(732)',
                    message: 'Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(732)',
                    path: 'pkg:/components/Services/Network/Parsers.brs'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    lineNumber: 732,
                    errorText: '--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(733)',
                    message: 'Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(733)',
                    path: 'pkg:/components/Services/Network/Parsers.brs'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    lineNumber: 733,
                    errorText: '--- Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(734)',
                    message: 'Syntax Error. (compile error &h02) in pkg:/components/Services/Network/Parsers.brs(734)',
                    path: 'pkg:/components/Services/Network/Parsers.brs'
                }
            ];

            await runTest(lines, CompileStatus.compileError, expectedErrors);
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
                `Found 1 parse error in XML file ChannelItemComponent.xml`,
                `--- Line 9: XML syntax error found ---> not well-formed (invalid token)`,
                `03-26 23:14:06.499 [scrpt.parse.mkup.time] Parsed markup dev 'sampleApp' in 108 milliseconds`,
                ``,
                `------ Compiling dev 'sampleApp' ------`,
                `03-26 23:14:08.133 [scrpt.ctx.cmpl.time] Compiled 'sampleApp', id 'dev' in 1633 milliseconds`,
                `03-26 23:14:08.152 [scrpt.unload.mkup] Unloading markup dev 'sampleApp'`,
                ``,
                ``,
                `=================================================================`,
                `An error occurred while attempting to compile the application's components:`,
                `-------> Error parsing multiple XML components (SampleScreen.xml, ChannelItemComponent.xml)`
            ];

            let expectedErrors = [
                {
                    charEnd: 999,
                    charStart: 0,
                    errorText: 'ERR_COMPILE:',
                    lineNumber: 8,
                    message: 'XML syntax error found ---> not well-formed (invalid token)',
                    path: 'ChannelItemComponent.xml'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    errorText: 'ERR_COMPILE:',
                    lineNumber: 0,
                    message: 'general compile error in xml file',
                    path: 'SampleScreen.xml'
                }, {
                    charEnd: 999,
                    charStart: 0,
                    errorText: 'ERR_COMPILE:',
                    lineNumber: 0,
                    message: 'general compile error in xml file',
                    path: 'ChannelItemComponent.xml'
                }
            ];

            await runTest(lines, CompileStatus.compileError, expectedErrors);
        });

        it('detects Invalid #If/#ElseIf expression' , async () => {
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

            let expectedErrors = [
                {
                    charEnd: 999,
                    charStart: 0,
                    errorText: '--- Invalid #If/#ElseIf expression (<CONST-NAME> not defined) (compile error &h92) in Parsers.brs(19) \'BAD_BS_CONST\'',
                    lineNumber: 18,
                    message: 'compile error &h92) in Parsers.brs(19) \'BAD_BS_CONST\'',
                    path: 'Parsers.brs'
                }
            ];

            await runTest(lines, CompileStatus.compileError, expectedErrors);
        });

        it('detects No manifest', async () => {
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
                `An error occurred while attempting to install the application:`,
                ``,
                `------->No manifest. Invalid package.`
            ];

            let expectedErrors = [
                {
                    charEnd: 999,
                    charStart: 0,
                    errorText: 'ERR_COMPILE:',
                    lineNumber: 0,
                    message: 'No manifest. Invalid package.',
                    path: 'manifest'
                }
            ];
            await runTest(lines, CompileStatus.compileError, expectedErrors);
        });

    });
});
