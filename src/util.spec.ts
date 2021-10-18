/* eslint-disable camelcase */
import * as assert from 'assert';
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as net from 'net';
import * as path from 'path';
import * as sinonActual from 'sinon';
import type { BrightScriptDebugCompileError } from './CompileErrorProcessor';
import { GENERAL_XML_ERROR } from './CompileErrorProcessor';

import { util } from './util';
let sinon = sinonActual.createSandbox();

const rootDir = path.normalize(path.dirname(__dirname));

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

    describe('objectDiff', () => {
        let objectA;
        let objectB;

        beforeEach(() => {
            objectA = {
                a: 1,
                b: 2,
                c: 3,
                nestedLevelOne: {
                    x: 1,
                    y: 2,
                    z: 3,
                    nestedLevelTwo: {
                        w: 9,
                        q: 8,
                        r: 7
                    }
                }
            };

            objectB = {
                a: 1,
                b: 2,
                c: 3,
                nestedLevelOne: {
                    x: 1,
                    y: 2,
                    z: 3,
                    nestedLevelTwo: {
                        w: 9,
                        q: 8,
                        r: 7
                    }
                }
            };
        });

        it('should detect no changes', () => {
            assert.deepEqual(util.objectDiff(objectB, objectA), {});
        });

        it('should detect value changes', () => {
            objectB.b = '2';
            objectB.nestedLevelOne.y = 3;
            objectB.nestedLevelOne.nestedLevelTwo.q = true;
            assert.deepEqual(util.objectDiff(objectB, objectA), {
                b: '2',
                nestedLevelOne: {
                    nestedLevelTwo: {
                        q: true
                    },
                    y: 3
                }
            });
        });

        it('should handle deleted or undefined values', () => {
            delete objectA.a;
            objectB.b = '2';
            objectB.c = undefined;
            objectB.nestedLevelOne.x = null;
            objectB.nestedLevelOne.y = 3;

            assert.deepEqual(util.objectDiff(objectB, objectA), {
                a: 1,
                b: '2',
                c: undefined,
                nestedLevelOne: {
                    x: null,
                    y: 3
                }
            });
        });

        it('should not return excluded values', () => {
            objectB.b = '2';
            objectB.nestedLevelOne.y = 3;
            objectB.nestedLevelOne.nestedLevelTwo.q = true;
            assert.deepEqual(util.objectDiff(objectB, objectA, ['2']), {
                nestedLevelOne: {
                    nestedLevelTwo: {
                        q: true
                    },
                    y: 3
                }
            });
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
            expect(util.getVariablePath('a["b"]')).to.eql(['a', 'b']);
            expect(util.getVariablePath('a["b"]["c"]')).to.eql(['a', 'b', 'c']);
            expect(util.getVariablePath('a["b"][0]')).to.eql(['a', 'b', '0']);
            expect(util.getVariablePath('a["b"].c[0]')).to.eql(['a', 'b', 'c', '0']);
            expect(util.getVariablePath(`m_that["this -that.thing"]  .other[9]`)).to.eql(['m_that', 'this -that.thing', 'other', '9']);
            expect(util.getVariablePath(`a`)).to.eql(['a']);
            expect(util.getVariablePath(`boy5`)).to.eql(['boy5']);
            expect(util.getVariablePath(`super_man$`)).to.eql(['super_man$']);
            expect(util.getVariablePath(`_super_man$`)).to.eql(['_super_man$']);
            expect(util.getVariablePath(`a["something with a quote"].c`)).to.eql(['a', 'something with a quote', 'c']);
            expect(util.getVariablePath(`m.global.initialInputEvent`)).to.eql(['m', 'global', 'initialInputEvent']);
            expect(util.getVariablePath(`m.["that"]`)).to.eql(['m', 'that']);
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

});
