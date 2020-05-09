// tslint:disable:no-unused-expression
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { SourceMapConsumer, SourceNode } from 'source-map';

import { BreakpointManager } from './BreakpointManager';
import { fileUtils } from '../FileUtils';
import { Project } from './ProjectManager';
let n = fileUtils.standardizePath.bind(fileUtils);
import { standardizePath as s } from '../FileUtils';
import { SourceLocator, SourceLocation } from '../SourceLocator';

describe('BreakpointManager', () => {
    let cwd = fileUtils.standardizePath(process.cwd());

    let tmp = s`${cwd}/.tmp`;
    let rootDir = s`${tmp}/rootDir`;
    let stagingDir = s`${tmp}/stagingDir`;
    let distDir = s`${tmp}/dist`;
    let srcDir = s`${tmp}/src`;
    let outDir = s`${tmp}/out`;

    let bpManager: BreakpointManager;
    //cast the manager as any to simplify some of the tests
    let b: any;
    beforeEach(() => {
        fsExtra.ensureDirSync(tmp);
        fsExtra.emptyDirSync(tmp);
        fsExtra.ensureDirSync(`${rootDir}/source`);
        fsExtra.ensureDirSync(`${stagingDir}/source`);
        fsExtra.ensureDirSync(`${distDir}/source`);
        fsExtra.ensureDirSync(`${srcDir}/source`)
        fsExtra.ensureDirSync(outDir);

        bpManager = new BreakpointManager();
        b = bpManager;
    });

    describe('sanitizeSourceFilePath', () => {
        it('returns the original string when no key was found', () => {
            expect(bpManager.sanitizeSourceFilePath('a/b/c')).to.equal(s`a/b/c`);
        });
        it('returns the the found key when it already exists', () => {
            b.breakpointsByFilePath[s`A/B/C`] = [];
            expect(bpManager.sanitizeSourceFilePath('a/b/c')).to.equal(s`A/B/C`);
        });
    });

    describe('getSourceAndMapWithBreakpoints', () => {
        it('correctly injects standard breakpoints', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                    function Main()
                        print "Hello world"
                    end function
                `,
                [<any>{
                    line: 3,
                }]).code
            ).to.equal(`
                    function Main()\nSTOP
                        print "Hello world"
                    end function
                `);
        });

        it('injects conditions', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                line: 3,
                condition: 'age=1'
            }]).code).to.equal(`
                function Main()\nif age=1 then : STOP : end if
                    print "Hello world"
                end function
            `);
        });

        it('injects hit conditions', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                line: 3,
                hitCondition: '1'
            }]).code).to.equal(`
                function Main()\nif Invalid = m.vscode_bp OR Invalid = m.vscode_bp.bp1 then if Invalid = m.vscode_bp then m.vscode_bp = {bp1: 0} else m.vscode_bp.bp1 = 0 else m.vscode_bp.bp1 ++ : if m.vscode_bp.bp1 >= 1 then STOP
                    print "Hello world"
                end function
            `);
        });

        it('injects regular stop when hit condition is 0', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                line: 3,
                hitCondition: '0'
            }]).code).to.equal(`
                function Main()\nSTOP
                    print "Hello world"
                end function
            `);
        });

        it('injects logMessage', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                line: 3,
                logMessage: 'test print'
            }]).code).to.equal(`
                function Main()\nPRINT "test print"
                    print "Hello world"
                end function
            `);
        });

        it('injects logMessage with interpolated values', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                line: 3,
                logMessage: 'hello {name}, how is {city}'
            }]).code).to.equal(`
                function Main()\nPRINT "hello "; name;", how is "; city;""
                    print "Hello world"
                end function
            `);
        });

        it('generates valid source map', async () => {
            let result = bpManager.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, <any>[{
                line: 3,
                column: 5,
                sourceFilePath: 'rootDir/source/test.brs',
                stagingFilePath: 'stagingDir/source/test.brs',
                type: 'sourceDirs'
            }]);
            expect(result.map).to.exist;

            //validate that the source map is correct
            await SourceMapConsumer.with(result.map.toString(), null, (consumer) => {
                expect(consumer.originalPositionFor({
                    line: 4,
                    column: 0
                })).contain({
                    line: 3
                });
            });
        });
    });

    describe('setBreakpointsForFile', () => {
        it('verifies all breakpoints before launch', () => {
            var breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }, {
                line: 1,
                column: 0
            }]);
            expect(breakpoints).to.be.lengthOf(2);
            expect(breakpoints[0]).to.include({
                line: 0,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            });
            expect(breakpoints[1]).to.include({
                line: 1,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            });
        });

        it('does not verify breakpoints after launch', () => {
            bpManager.lockBreakpoints();
            let breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 0,
                column: 0,
                verified: false,
                wasAddedBeforeLaunch: false
            });
        });

        it('re-verifies breakpoint after launch toggle', () => {
            //set the breakpoint before launch
            let breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
                line: 2
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: true,
                isHidden: false
            });

            //launch
            bpManager.lockBreakpoints();

            //simulate user deleting all breakpoints
            breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, []);

            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                verified: true,
                isHidden: true
            });

            //simulate user adding a breakpoint to the same place it had been before
            breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
                line: 2
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true,
                isHidden: false
            });
        });
    });

    describe('writeBreakpointsForProject', () => {
        let tmpPath = s`${cwd}/.tmp`;
        let rootDir = s`${tmpPath}/rokuProject`;
        let outDir = s`${tmpPath}/out`;
        let stagingFolderPath = s`${outDir}/staging`;
        let sourceDir1 = s`${tmpPath}/source1`;
        let sourceDir2 = s`${tmpPath}/source2`;

        beforeEach(() => {
            fsExtra.ensureDirSync(`${rootDir}/source`);
            fsExtra.ensureDirSync(`${stagingFolderPath}/source`);
            fsExtra.ensureDirSync(`${tmpPath}/source`);
            fsExtra.ensureDirSync(`${sourceDir1}/source`);
            fsExtra.ensureDirSync(`${sourceDir2}/source`);
        });

        afterEach(() => {
            try { fsExtra.removeSync(tmpPath); } catch (e) { }
        });

        it('works with normal flow', async () => {
            fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //set the breakpoint before launch
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 3
            }]);

            fsExtra.ensureDirSync(`${stagingFolderPath}/source`);
            //copy the file to staging
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingFolderPath}/source/main.brs`);

            //launch
            bpManager.lockBreakpoints();

            //file was copied to staging
            expect(fsExtra.pathExistsSync(`${stagingFolderPath}/source/main.brs`)).to.be.true;
            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingFolderPath}/source/main.brs.map`)).to.be.false;

            await bpManager.writeBreakpointsForProject(new Project(<any>{
                rootDir: rootDir,
                outDir: outDir,
                stagingFolderPath: stagingFolderPath
            }));

            //it wrote the breakpoint in the correct location
            expect(fsExtra.readFileSync(`${stagingFolderPath}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);

            //sourcemap was created
            expect(fsExtra.pathExistsSync(`${stagingFolderPath}/source/main.brs.map`)).to.be.true;

            //sourcemap points to correct location (notice we ask about line 4, but get back line 3)
            expect(await fileUtils.getSourceLocationFromSourceMap(`${stagingFolderPath}/source/main.brs`, 4, 0)).to.eql({
                columnIndex: 0,
                lineNumber: 3,
                filePath: s`${rootDir}/source/main.brs`
            });
        });

        it('works with sourceDir1', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir1}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir1}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically)
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingFolderPath}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.replaceBreakpoints(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpManager.lockBreakpoints();

            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingFolderPath}/source/main.brs.map`)).to.be.false;

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1],
                    stagingFolderPath: stagingFolderPath
                })
            );

            expect(fsExtra.readFileSync(`${stagingFolderPath}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);

            //sourcemap was created
            expect(fsExtra.pathExistsSync(`${stagingFolderPath}/source/main.brs.map`)).to.be.true;

            //sourcemap points to correct location (notice we ask about line 4, but get back line 3)
            expect(await fileUtils.getSourceLocationFromSourceMap(`${stagingFolderPath}/source/main.brs`, 4, 0)).to.eql({
                columnIndex: 0,
                lineNumber: 3,
                filePath: n(`${sourceDir1}/source/main.brs`)
            });
        });

        it('works with file existing in second sourceDir but not first', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir2}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir2}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingFolderPath}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpManager.lockBreakpoints();

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingFolderPath
                })
            );

            expect(fsExtra.readFileSync(`${stagingFolderPath}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });

        it('does not duplicate breakpoints with breakpoint set in both sourceDir files', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir1}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //duplicate file in sourceDir2
            fsExtra.copyFileSync(`${sourceDir1}/source/main.brs`, `${sourceDir2}/source/main.brs`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir2}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingFolderPath}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.replaceBreakpoints(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);
            bpManager.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpManager.lockBreakpoints();

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingFolderPath
                })
            );

            expect(fsExtra.readFileSync(`${stagingFolderPath}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });
    });

    describe('writeBreakpointsToFile', () => {
        it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
            fsExtra.ensureDirSync(s`${tmp}/dist`);
            let src = s`${rootDir}/main.bs`;

            //create the source file
            fsExtra.writeFileSync(src,
                '\n' +
                '\n' +
                '\n' +
                'function main()\n' +
                '    orig1 = 1\n' +
                '    orig2 = 2\n' +
                '    orig3 = 3\n' +
                'end function'
            );

            //create the "compiled" dist file
            let chunks = [
                new SourceNode(4, 0, src, 'function main()\n'),
                new SourceNode(5, 0, src, '    orig1 = 1\n'),
                '    injected1 = 1\n',
                new SourceNode(6, 0, src, '    orig2 = 2\n'),
                '    injected2 = 2\n',
                new SourceNode(7, 0, src, '    orig3 = 3\n'),
                '    injected3 = 3\n',
                new SourceNode(8, 0, src, 'end function')
            ];
            let result = new SourceNode(null, null, src, chunks).toStringWithSourceMap();
            fsExtra.writeFileSync(s`${tmp}/dist/main.brs`, result.code);
            fsExtra.writeFileSync(s`${tmp}/dist/main.brs.map`, result.map.toString());

            fsExtra.writeFileSync(s`${stagingDir}/main.brs`, result.code);
            fsExtra.writeFileSync(s`${stagingDir}/main.brs.map`, result.map.toString());

            //set a few breakpoints in the source files
            bpManager.registerBreakpoint(src, {
                line: 5
            });
            bpManager.registerBreakpoint(src, {
                line: 7
            });

            await bpManager.writeBreakpointsForProject(new Project({
                files: [
                    'main.brs'
                ],
                rootDir: s`${tmp}/dist`,
                outDir: s`${tmp}/out`,
                stagingFolderPath: stagingDir
            }));

            //the breakpoints should be placed in the proper locations
            expect(fsExtra.readFileSync(s`${stagingDir}/main.brs`).toString()).to.eql(
                'function main()\n' +
                'STOP\n' +
                '    orig1 = 1\n' +
                '    injected1 = 1\n' +
                '    orig2 = 2\n' +
                '    injected2 = 2\n' +
                'STOP\n' +
                '    orig3 = 3\n' +
                '    injected3 = 3\n' +
                'end function'
            );
        });

        //this is just a sample test to show how we need to create 
        it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
            var srcPath = 'program.brs';
            function n(line, col, txt) {
                return new SourceNode(line, col, srcPath, txt);
            }
            let src =
                'sub main()\n' +
                '\n' +
                '    print 1\n' +
                '\n' +
                'end function';

            //remove empty newlines
            let chunks = [
                n(1, 0, 'sub'), ' ', n(1, 4, 'main'), n(1, 8, '('), n(1, 9, ')'), '\n',
                '    ', n(3, 4, 'print'), ' ', n(3, 11, '1'), '\n',
                n(5, 0, 'end'), ' ', n(5, 4, 'function')
            ];
            let result = new SourceNode(null, null, srcPath, chunks).toStringWithSourceMap();
            fsExtra.writeFileSync('C:/users/bronley/desktop/3.bs', src);
            fsExtra.writeFileSync('C:/users/bronley/desktop/1.brs', result.code);
            fsExtra.writeFileSync('C:/users/bronley/desktop/2.brs.map', result.map.toString());
            let position = await SourceMapConsumer.with(result.map.toJSON(), null, (consumer) => {
                return consumer.generatedPositionFor({
                    line: 3,
                    column: 0,
                    source: srcPath,
                    //bias is critical. Without this, we would default to the last char of previous line
                    bias: SourceMapConsumer.LEAST_UPPER_BOUND
                });
            });
            expect({ line: position.line, column: position.column }).to.eql({
                line: 2,
                column: 4
            });
        });

        //this is just a sample test to show how we need to create 
        it.skip('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
            var sourceFilePath = s`${srcDir}/source/main.brs`;
            function n(line, col, txt) {
                return new SourceNode(line, col, sourceFilePath, txt);
            }
            let sourceFile =
                'sub main()\n' +
                '\n' +
                '    print 1\n' +
                '\n' +
                'end function';
            //remove empty newlines
            let chunks = [
                n(1, 0, 'sub'), ' ', n(1, 4, 'main'), n(1, 8, '('), n(1, 9, ')'), '\n',
                '    ', n(3, 4, 'print'), ' ', n(3, 11, '1'), '\n',
                n(5, 0, 'end'), ' ', n(5, 4, 'function')
            ];
            let result = new SourceNode(null, null, sourceFilePath, chunks).toStringWithSourceMap();

            //write the files
            fsExtra.writeFileSync(sourceFilePath, sourceFile);
            
            fsExtra.writeFileSync(`${rootDir}/source/main.brs`, result.code);
            fsExtra.writeFileSync(`${rootDir}/source/main.brs.map`, result.map.toString());

            fsExtra.writeFileSync(`${stagingDir}/source/main.brs`, result.code);
            fsExtra.writeFileSync(`${stagingDir}/source/main.brs.map`, result.map.toString());

            //sanity check: verify the original source map is useable
            let position = await SourceMapConsumer.with(result.map.toJSON(), null, (consumer) => {
                return consumer.generatedPositionFor({
                    line: 3,
                    column: 0,
                    source: sourceFilePath,
                    //bias is critical. Without this, we would default to the last char of previous line
                    bias: SourceMapConsumer.LEAST_UPPER_BOUND
                });
            });
            expect({ line: position.line, column: position.column }).to.eql({
                line: 2,
                column: 4
            });

            bpManager.registerBreakpoint(sourceFilePath, {
                line: 3,
                column: 0
            });

            await bpManager.writeBreakpointsForProject(new Project({
                files: [
                    'source/main.brs'
                ],
                stagingFolderPath: stagingDir,
                outDir: outDir,
                rootDir: rootDir
            }));

            fsExtra.copyFileSync(sourceFilePath, 'C:/users/bronley/desktop/3.bs');
            fsExtra.copyFileSync(s`${stagingDir}/source/main.brs`, s`C:/users/bronley/desktop/1.brs`);
            fsExtra.copyFileSync(s`${stagingDir}/source/main.brs.map`, s`C:/users/bronley/desktop/2.brs.map`);

            //use sourcemap to look up original location
            let location = await new SourceLocator().getSourceLocation({
                stagingFilePath: s`${stagingDir}/source/main.brs`,
                columnIndex: 0,
                lineNumber: 2,
                fileMappings: [],
                rootDir: rootDir,
                stagingFolderPath: stagingDir,
                enableSourceMaps: true
            });

            expect(location).to.eql({
                columnIndex: 0,
                lineNumber: 3,
                filePath: sourceFilePath
            } as SourceLocation);
        });
    });
});
