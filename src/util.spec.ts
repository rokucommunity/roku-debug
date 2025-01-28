import * as assert from 'assert';
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as net from 'net';
import * as path from 'path';
import type { BSDebugDiagnostic } from './CompileErrorProcessor';
import * as dedent from 'dedent';
import { util } from './util';
import { util as bscUtil } from 'brighterscript';
import { createSandbox } from 'sinon';
import { describe } from 'mocha';
const sinon = createSandbox();

beforeEach(() => {
    sinon.restore();
});

describe('Util', () => {

    describe('hasNonNullishProperty', () => {
        it('detects objects with only nullish props or no props at all', () => {
            expect(util.hasNonNullishProperty({})).to.be.false;
            expect(util.hasNonNullishProperty([])).to.be.false;
            expect(util.hasNonNullishProperty(null)).to.be.false;
            expect(util.hasNonNullishProperty(undefined)).to.be.false;
            expect(util.hasNonNullishProperty(1 as any)).to.be.false;
            expect(util.hasNonNullishProperty(true as any)).to.be.false;
            expect(util.hasNonNullishProperty(/asdf/)).to.be.false;
            expect(util.hasNonNullishProperty({ nullish: null })).to.be.false;
            expect(util.hasNonNullishProperty({ nullish: undefined })).to.be.false;
        });

        it('detects objects with defined props', () => {
            expect(util.hasNonNullishProperty({ val: true })).to.be.true;
            expect(util.hasNonNullishProperty({ val: true, nullish: undefined })).to.be.true;
            expect(util.hasNonNullishProperty({ val: false })).to.be.true;
            expect(util.hasNonNullishProperty({ val: false, nullish: false })).to.be.true;
        });
    });

    describe('isAssignableExpression', () => {
        it('works', () => {
            expect(util.isAssignableExpression('function test(): endFunction')).to.be.false;
            expect(util.isAssignableExpression('if true then print true')).to.be.false;
            expect(util.isAssignableExpression('while true: print true')).to.be.false;
            expect(util.isAssignableExpression('a.b.c = "test"')).to.be.false;
            expect(util.isAssignableExpression('array[0] = "test"')).to.be.false;
            expect(util.isAssignableExpression('2+2')).to.be.true;
            expect(util.isAssignableExpression('createThing()')).to.be.true;
            expect(util.isAssignableExpression('a.b.c')).to.be.true;
            expect(util.isAssignableExpression('array[0]')).to.be.true;
        });
    });

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

        it('should support file schemes with underscores', () => {
            assert.equal(util.getFileScheme('thing_with_underscores:/source/lib.brs'), 'thing_with_underscores:');
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

    describe('handleLogFragments', () => {
        it('handles no new lines', () => {
            expect(
                util.handleLogFragments('', 'new string')
            ).to.eql({ completed: '', remaining: 'new string' });
        });

        it('handles single new line', () => {
            expect(
                util.handleLogFragments('', 'new string\n')
            ).to.eql({ completed: 'new string\n', remaining: '' });
        });

        it('handles multiple new lines', () => {
            expect(
                util.handleLogFragments('', 'new string\none new\nline\n')
            ).to.eql({ completed: 'new string\none new\nline\n', remaining: '' });
        });

        it('handles partial lines', () => {
            expect(
                util.handleLogFragments('', 'new string\none new\nline')
            ).to.eql({ completed: 'new string\none new\n', remaining: 'line' });
        });

        it('handles partial lines and concat', () => {
            expect(
                util.handleLogFragments('new', ' string\none new\nline')
            ).to.eql({ completed: 'new string\none new\n', remaining: 'line' });
        });

        it('handles partial lines, concat, and new lines in the existing somehow', () => {
            expect(
                util.handleLogFragments('new\n', ' string\none new\nline')
            ).to.eql({ completed: 'new\n string\none new\n', remaining: 'line' });
        });

        it('handles when no newlines are found and concats the two stings into remaining', () => {
            let currentLeftover = `some new logs `;
            let newLogs = `that are still not complete and need to be concatenated`;
            expect(
                util.handleLogFragments(currentLeftover, newLogs)
            ).to.eql({ completed: '', remaining: currentLeftover + newLogs });
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

        it('detects valid virtual patterns', () => {
            expect(util.getVariablePath('m["top"].$children')).to.eql(['m', '"top"', '$children']);
            expect(util.getVariablePath('m["top"]["$children"]')).to.eql(['m', '"top"', '"$children"']);
        });

        it('rejects invalid patterns', () => {
            expect(util.getVariablePath('[0]')).undefined;
            expect(util.getVariablePath('m.global.initialInputEvent.0')).undefined;
            expect(util.getVariablePath('m.global.initialInputEvent.0[123]')).undefined;
            expect(util.getVariablePath('m.global.initialInputEvent.0[123]["this \"-that.thing"]')).undefined;
            expect(util.getVariablePath('m.global["something with a quote"]initialInputEvent.0[123]["this \"-that.thing"]')).undefined;
            expect(util.getVariablePath('m.top.gridState?.leftEdgeTime')).undefined;
            expect(util.getVariablePath('m.top.gridState?["leftEdgeTime"]')).undefined;
            expect(util.getVariablePath('m.top.gridState?.["leftEdgeTime"]')).undefined;
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

    describe('isTransientVariable', () => {
        it('is transient', () => {
            expect(util.isTransientVariable('__brs_err__')).to.be.true;
            expect(util.isTransientVariable('__brs_errcond__')).to.be.true;
            expect(util.isTransientVariable('__brs_cond__')).to.be.true;
        });

        it('is not transient', () => {
            expect(util.isTransientVariable('brs_err')).to.be.false;
            expect(util.isTransientVariable('brs_errcond')).to.be.false;
            expect(util.isTransientVariable('brs_cond')).to.be.false;

            expect(util.isTransientVariable('__brs_err')).to.be.false;
            expect(util.isTransientVariable('__brs_errcond')).to.be.false;
            expect(util.isTransientVariable('__brs_cond')).to.be.false;

            expect(util.isTransientVariable('brs_err__')).to.be.false;
            expect(util.isTransientVariable('brs_errcond__')).to.be.false;
            expect(util.isTransientVariable('brs_cond__')).to.be.false;

            expect(util.isTransientVariable('garbage')).to.be.false;
        });

    });
});
