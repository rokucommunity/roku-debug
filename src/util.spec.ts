import * as assert from 'assert';
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as net from 'net';
import * as path from 'path';
import * as sinonActual from 'sinon';
import type { BrightScriptDebugCompileError } from './CompileErrorProcessor';
import { GENERAL_XML_ERROR } from './CompileErrorProcessor';
import * as dedent from 'dedent';
import { util } from './util';
let sinon = sinonActual.createSandbox();

beforeEach(() => {
    sinon.restore();
});

describe('Util', () => {

    describe('removeTrailingNewline', () => {
        it('works', () => {
            expect(util.removeTrailingNewline('\r\n')).to.equal('');
            expect(util.removeTrailingNewline('\n')).to.equal('');
            expect(util.removeTrailingNewline('\r\n\r\n')).to.equal('\r\n');
        });
    });

    describe('checkForTrailingSlash', () => {
        it('should add trailing slash when missing', () => {
            assert.equal(util.ensureTrailingSlash('./.tmp/findMainFunctionTests'), './.tmp/findMainFunctionTests/');
        });

        it('should not add trailing slash when present', () => {
            let unchangedStringTestValue = './.tmp/findMainFunctionTests/';
            assert.equal(util.ensureTrailingSlash(unchangedStringTestValue), unchangedStringTestValue);
        });
    });

    describe('fileExists', () => {
        let folder: string;
        let filePath: string;

        beforeEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            filePath = path.resolve(`${folder}/testFile`);
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        it('should return true when found', async () => {
            fsExtra.writeFileSync(filePath, '# my test content');
            assert.equal((await util.fileExists(filePath)), true);
        });

        it('should return false when not found', async () => {
            assert.equal((await util.fileExists(filePath)), false);
        });
    });

    describe('removeFileScheme', () => {
        it('should return remove the leading scheme', () => {
            assert.equal(util.removeFileScheme('g:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('pkg:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('RandomComponentLibraryName:/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
        });

        it('should should not modify the path when there is no scheme', () => {
            assert.equal(util.removeFileScheme('/images/channel-poster_hd.png'), '/images/channel-poster_hd.png');
            assert.equal(util.removeFileScheme('ages/channel-poster_hd.png'), 'ages/channel-poster_hd.png');
        });
    });

    describe('getFileScheme', () => {
        it('should return the leading scheme', () => {
            assert.equal(util.getFileScheme('pkg:/images/channel-poster_hd.png'), 'pkg:');
            assert.equal(util.getFileScheme('RandomComponentLibraryName:/images/channel-poster_hd.png'), 'randomcomponentlibraryname:');
        });

        it('should should return null when there is no scheme', () => {
            assert.equal(util.getFileScheme('/images/channel-poster_hd.png'), null);
            assert.equal(util.getFileScheme('ages/channel-poster_hd.png'), null);
        });
    });

    describe('convertManifestToObject', () => {
        let fileContents: string;
        let expectedManifestObject: Record<string, string>;
        let folder: string;
        let filePath: string;

        beforeEach(() => {
            fileContents = `# Channel Details
                title=HeroGridChannel
                subtitle=Roku Sample Channel App
                major_version=1
                minor_version=1
                build_version=00001

                # Channel Assets
                mm_icon_focus_hd=pkg:/images/channel-poster_hd.png
                mm_icon_focus_sd=pkg:/images/channel-poster_sd.png

                # Splash Screen + Loading Screen Artwork
                splash_screen_sd=pkg:/images/splash-screen_sd.jpg
                splash_screen_hd=pkg:/images/splash-screen_hd.jpg
                splash_screen_fhd=pkg:/images/splash-screen_fhd.jpg
                splash_color=#808080
                splash_min_time=0
                # Resolution
                ui_resolutions=fhd

                confirm_partner_button=1
                bs_const=const=false;const2=true;const3=false
            `.replace(/ {4}/g, '');

            expectedManifestObject = {
                title: 'HeroGridChannel',
                subtitle: 'Roku Sample Channel App',
                major_version: '1',
                minor_version: '1',
                build_version: '00001',
                mm_icon_focus_hd: 'pkg:/images/channel-poster_hd.png',
                mm_icon_focus_sd: 'pkg:/images/channel-poster_sd.png',
                splash_screen_sd: 'pkg:/images/splash-screen_sd.jpg',
                splash_screen_hd: 'pkg:/images/splash-screen_hd.jpg',
                splash_screen_fhd: 'pkg:/images/splash-screen_fhd.jpg',
                splash_color: '#808080',
                splash_min_time: '0',
                ui_resolutions: 'fhd',
                confirm_partner_button: '1',
                bs_const: 'const=false;const2=true;const3=false'
            };

            fsExtra.emptyDirSync('./.tmp');
            folder = path.resolve('./.tmp/findMainFunctionTests/');
            fsExtra.mkdirSync(folder);

            filePath = path.resolve(`${folder}/manifest`);
        });

        afterEach(() => {
            fsExtra.emptyDirSync('./.tmp');
            fsExtra.rmdirSync('./.tmp');
        });

        it('should read the manifest and return an js object version of it', async () => {
            fsExtra.writeFileSync(filePath, fileContents);
            let manifestObject = await util.convertManifestToObject(filePath);
            assert.deepEqual(manifestObject, expectedManifestObject);
        });

        it('should return undefined when the manifest is not found', async () => {
            let manifestObject = await util.convertManifestToObject(filePath);
            assert.equal(manifestObject, undefined);
        });
    });

    describe('isPortInUse', () => {
        let otherServer: net.Server;
        let port: number;

        beforeEach(async () => {
            port = await getPort();
            otherServer = await new Promise<net.Server>((resolve, reject) => {
                const tester = net.createServer()
                    .once('listening', () => {
                        resolve(tester);
                    })
                    .listen(port);
            });
        });

        it('should detect when a port is in use', async () => {
            assert.equal(true, await util.isPortInUse(port));
        });

        it('should detect when a port is not in use', async () => {
            assert.equal(false, await util.isPortInUse(port + 1));
        });

        afterEach(() => {
            otherServer.close();
        });
    });

    describe('ensureDebugPromptOnOwnLine', () => {
        it('leaves good code alone', () => {
            expect(
                util.ensureDebugPromptOnOwnLine(`Brightscript Debugger>`)
            ).to.eql(`Brightscript Debugger>`);
        });

        it('splits leading text', () => {
            expect(
                util.ensureDebugPromptOnOwnLine(`BLABLABrightscript Debugger>`)
            ).to.eql(`BLABLA\nBrightscript Debugger>`);
        });

        it('splits trailing text', () => {
            expect(
                util.ensureDebugPromptOnOwnLine(`Brightscript Debugger>BLABLA`)
            ).to.eql(`Brightscript Debugger>\nBLABLA`);
        });

        it('splits trailing text and whitespace', () => {
            expect(
                util.ensureDebugPromptOnOwnLine(`Brightscript Debugger> 10-29 15:39:24.956 [beacon.header] __________________________________________`)
            ).to.eql(`Brightscript Debugger> \n10-29 15:39:24.956 [beacon.header] __________________________________________`);
        });
    });

    describe('filterGenericErrors', () => {
        it('should remove generic errors IF a more specific exists', () => {
            const err1: BrightScriptDebugCompileError = {
                path: 'file1.xml',
                lineNumber: 0,
                charStart: 0,
                charEnd: 0,
                message: 'Some other error',
                errorText: 'err1'
            };
            const err2: BrightScriptDebugCompileError = {
                path: 'file1.xml',
                lineNumber: 0,
                charStart: 0,
                charEnd: 0,
                message: GENERAL_XML_ERROR,
                errorText: 'err2'
            };
            const err3: BrightScriptDebugCompileError = {
                path: 'file2.xml',
                lineNumber: 0,
                charStart: 0,
                charEnd: 0,
                message: GENERAL_XML_ERROR,
                errorText: 'err3'
            };
            const err4: BrightScriptDebugCompileError = {
                path: 'file3.xml',
                lineNumber: 0,
                charStart: 0,
                charEnd: 0,
                message: 'Some other error',
                errorText: 'err4'
            };
            const expected = [
                err1,
                err3,
                err4
            ];
            const actual = util.filterGenericErrors([err1, err2, err3, err4]);
            expect(actual).to.deep.equal(expected);
        });
    });

    describe('getVariablePath', () => {
        it('detects valid patterns', () => {
            expect(util.getVariablePath('a')).to.eql(['a']);
            expect(util.getVariablePath('a[0].b.c[0]')).to.eql(['a', '0', 'b', 'c', '0']);
            expect(util.getVariablePath('a.b')).to.eql(['a', 'b']);
            expect(util.getVariablePath('a.b.c')).to.eql(['a', 'b', 'c']);
            expect(util.getVariablePath('a[0]')).to.eql(['a', '0']);
            expect(util.getVariablePath('a[0].b')).to.eql(['a', '0', 'b']);
            expect(util.getVariablePath('a[0].b[0]')).to.eql(['a', '0', 'b', '0']);
            expect(util.getVariablePath('a["b"]')).to.eql(['a', '"b"']);
            expect(util.getVariablePath('a["b"]["c"]')).to.eql(['a', '"b"', '"c"']);
            expect(util.getVariablePath('a["b"][0]')).to.eql(['a', '"b"', '0']);
            expect(util.getVariablePath('a["b"].c[0]')).to.eql(['a', '"b"', 'c', '0']);
            expect(util.getVariablePath(`m_that["this -that.thing"]  .other[9]`)).to.eql(['m_that', '"this -that.thing"', 'other', '9']);
            expect(util.getVariablePath(`a`)).to.eql(['a']);
            expect(util.getVariablePath(`boy5`)).to.eql(['boy5']);
            expect(util.getVariablePath(`super_man$`)).to.eql(['super_man$']);
            expect(util.getVariablePath(`_super_man$`)).to.eql(['_super_man$']);
            expect(util.getVariablePath(`a["something with a quote"].c`)).to.eql(['a', '"something with a quote"', 'c']);
            expect(util.getVariablePath(`m.global.initialInputEvent`)).to.eql(['m', 'global', 'initialInputEvent']);
            expect(util.getVariablePath(`m.["that"]`)).to.eql(['m', '"that"']);
        });

        it('rejects invalid patterns', () => {
            expect(util.getVariablePath('[0]')).undefined;
            expect(util.getVariablePath('m.global.initialInputEvent.0')).undefined;
            expect(util.getVariablePath('m.global.initialInputEvent.0[123]')).undefined;
            expect(util.getVariablePath('m.global.initialInputEvent.0[123]["this \"-that.thing"]')).undefined;
            expect(util.getVariablePath('m.global["something with a quote"]initialInputEvent.0[123]["this \"-that.thing"]')).undefined;
        });
    });

    describe('trimDebugPrompt', () => {
        it('correctly handles both types of line endings', () => {
            expect(util.trimDebugPrompt(
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n' +
                '\r\n' +
                'Brightscript Debugger>'
            )).to.equal((
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n'
            ));
        });

        it('trims stuff', () => {
            expect(
                util.trimDebugPrompt('roString\r\n\r\nBrightscript Debugger> ')
            ).to.eql('roString\r\n');
        });

        it('does not crash on falsey values', () => {
            util.trimDebugPrompt(undefined);
            util.trimDebugPrompt(null);
            (util.trimDebugPrompt as any)(false);
            (util.trimDebugPrompt as any)(NaN);
            (util.trimDebugPrompt as any)(Infinity);
            (util.trimDebugPrompt as any)(/asdf/);
        });
    });

    describe('isPrintVarExpression', () => {
        it('works for normal use cases', () => {
            expect(util.isPrintVarExpression('print thing')).to.be.true;
            expect(util.isPrintVarExpression(' print thing')).to.be.true;
            expect(util.isPrintVarExpression('\tprint thing')).to.be.true;
            expect(util.isPrintVarExpression('print a')).to.be.true;
            expect(util.isPrintVarExpression('print a[1]')).to.be.true;
            expect(util.isPrintVarExpression('print a.b')).to.be.true;
            expect(util.isPrintVarExpression('print a["b"]')).to.be.true;
            expect(util.isPrintVarExpression('print a.b["c"]')).to.be.true;
            expect(util.isPrintVarExpression('print a["b"].c')).to.be.true;
            //print shorthand works too
            expect(util.isPrintVarExpression('?a')).to.be.true;
        });

        it('returns false for non simple expressions', () => {
            expect(util.isPrintVarExpression('print a[someVariable]')).to.be.false;
            expect(util.isPrintVarExpression('print a.b[someVar]')).to.be.false;
            expect(util.isPrintVarExpression('a[1] = true')).to.be.false;
            expect(util.isPrintVarExpression('doSomething()')).to.be.false;
        });
    });

    describe('removeThreadAttachedText', () => {
        it('removes when found', () => {
            expect(
                dedent(util.removeThreadAttachedText(`
                    Thread attached: pkg:/source/main.brs(6)                 screen.show()

                    Brightscript Debugger> ID    Location                                Source Code
                    0    pkg:/source/main.brs(6)                 screen.show()
                    1*   pkg:/components/MainScene.brs(6)        STOP
                    *selected

                    Brightscript Debugger>  
                `))
            ).to.eql(dedent`
                ID    Location                                Source Code
                0    pkg:/source/main.brs(6)                 screen.show()
                1*   pkg:/components/MainScene.brs(6)        STOP
                *selected

                Brightscript Debugger>  
            `);
        });

        it('does not change unmatched text', () => {
            const text = `
                ID    Location                                Source Code
                0    pkg:/source/main.brs(6)                 screen.show()
                1*   pkg:/components/MainScene.brs(6)        STOP
                *selected

                Brightscript Debugger> 
            `;
            expect(
                util.removeThreadAttachedText(text)
            ).to.eql(text);
        });

        it('matches truncated file paths', () => {
            const text = `
                Thread attached: ...Modules/MainMenu/MainMenu.brs(309)   renderTracking = m.top.renderTracking
                
                Brightscript Debugger>
            `;
            expect(
                util.removeThreadAttachedText(text)
                //removes it all
            ).to.eql('');
        });
    });

    describe('endsWithThreadAttachedText', () => {
        it('matches single line', () => {
            expect(
                util.endsWithThreadAttachedText(`Thread attached: pkg:/source/main.brs(6)                 screen.show()`)
            ).to.be.true;
        });

        it('matches for leading whitespace line', () => {
            expect(
                util.endsWithThreadAttachedText(`\n\r\n   Thread attached: pkg:/source/main.brs(6)                 screen.show()`)
            ).to.be.true;
        });

        it('matches for leading data', () => {
            expect(
                util.endsWithThreadAttachedText(`some stuff...\r\n   Thread attached: pkg:/source/main.brs(6)                 screen.show()`)
            ).to.be.true;
        });

        it('matches for trailing whitespace', () => {
            expect(
                util.endsWithThreadAttachedText(`Thread attached: pkg:/source/main.brs(6)                 screen.show()\r\n   `)
            ).to.be.true;
        });

        it('does not match when stuff comes after', () => {
            expect(
                util.endsWithThreadAttachedText(`Thread attached: pkg:/source/main.brs(6)                 screen.show()\r\n   Brightscript Debugger>\r\n`)
            ).to.be.false;
        });

        it('works for special case', () => {
            expect(
                util.endsWithThreadAttachedText('Thread attached: ...Modules/MainMenu/MainMenu.brs(309)   renderTracking = m.top.renderTracking\r\n\r\n')
            ).to.be.true;
        });
    });

    describe.only('retry', () => {
        it('kills on first error encountered', async () => {
            let tryCount = 0;
            let cancelCount = 0;
            await util.retry(() => {
                tryCount++;
                throw new Error('Crash');
            }, {
                onCancel: () => {
                    cancelCount++;
                },
                maxTryMs: 4,
                maxTotalMs: 10
            }).catch(() => { /*ignore the error */ });
            expect(tryCount).to.equal(1);
            expect(cancelCount).to.equal(0);
        });

        it('kills long-running tries', async () => {
            let tryCount = 0;
            let cancelCount = 0;
            const result = await util.retry(() => {
                tryCount++;
                if (tryCount >= 3) {
                    return true;
                } else {
                    return util.sleep(50);
                }
            }, {
                onCancel: () => {
                    cancelCount++;
                },
                maxTryMs: 4,
                maxTotalMs: 100
            });
            expect(result).to.be.true;
            expect(tryCount).to.equal(3);
            expect(cancelCount).to.equal(tryCount - 1);
        });

        it('kills tries that exceed the total runtime', async () => {
            try {
                await util.retry(() => {
                    return util.sleep(50);
                }, {
                    onCancel: () => {
                    },
                    maxTryMs: 4000,
                    maxTotalMs: 10
                });
            } catch (e) {
                expect(e.message).to.equal('Total allotted time exceeded');
            }
        });
    });
});
