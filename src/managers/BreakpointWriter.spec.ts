// tslint:disable:no-unused-expression
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { SourceMapConsumer, SourceNode } from 'source-map';

import { BreakpointWriter } from './BreakpointWriter';
import { fileUtils } from '../FileUtils';
import { Project } from './ProjectManager';
let n = fileUtils.standardizePath.bind(fileUtils);
import { standardizePath as s } from '../FileUtils';
import { LocationManager, SourceLocation } from './LocationManager';
import { SourceMapManager } from './SourceMapManager';

describe('BreakpointWriter', () => {
    let cwd = fileUtils.standardizePath(process.cwd());

    let tmpDir = s`${cwd}/.tmp`;
    let rootDir = s`${tmpDir}/rootDir`;
    let stagingDir = s`${tmpDir}/stagingDir`;
    let distDir = s`${tmpDir}/dist`;
    let srcDir = s`${tmpDir}/src`;
    let outDir = s`${tmpDir}/out`;

    let bpWriter: BreakpointWriter;
    let locationManager: LocationManager;
    let sourceMapManager: SourceMapManager;
    //cast the manager as any to simplify some of the tests
    let b: any;
    beforeEach(() => {
        fsExtra.ensureDirSync(tmpDir);
        fsExtra.emptyDirSync(tmpDir);
        fsExtra.ensureDirSync(`${rootDir}/source`);
        fsExtra.ensureDirSync(`${stagingDir}/source`);
        fsExtra.ensureDirSync(`${distDir}/source`);
        fsExtra.ensureDirSync(`${srcDir}/source`);
        fsExtra.ensureDirSync(outDir);

        sourceMapManager = new SourceMapManager();
        locationManager = new LocationManager(sourceMapManager);
        bpWriter = new BreakpointWriter(sourceMapManager, locationManager);
        b = bpWriter;
    });

    afterEach(() => {
        fsExtra.removeSync(tmpDir);
    });

    describe('sanitizeSourceFilePath', () => {
        it('returns the original string when no key was found', () => {
            expect(bpWriter.sanitizeSourceFilePath('a/b/c')).to.equal(s`a/b/c`);
        });
        it('returns the the found key when it already exists', () => {
            b.breakpointsByFilePath[s`A/B/C`] = [];
            expect(bpWriter.sanitizeSourceFilePath('a/b/c')).to.equal(s`A/B/C`);
        });
    });

    describe('getSourceAndMapWithBreakpoints', () => {
        it('correctly injects standard breakpoints', () => {
            expect(bpWriter.getSourceAndMapWithBreakpoints(`
                    function Main()
                        print "Hello world"
                    end function
                `,
                'main.brs',
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
            expect(bpWriter.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `,
                'main.brs',
                <any>[{
                    line: 3,
                    condition: 'age=1'
                }]).code).to.equal(`
                function Main()\nif age=1 then : STOP : end if
                    print "Hello world"
                end function
            `);
        });

        it('injects hit conditions', () => {
            expect(bpWriter.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `,
                'main.brs',
                <any>[{
                    line: 3,
                    hitCondition: '1'
                }]).code).to.equal(`
                function Main()\nif Invalid = m.vscode_bp OR Invalid = m.vscode_bp.bp1 then if Invalid = m.vscode_bp then m.vscode_bp = {bp1: 0} else m.vscode_bp.bp1 = 0 else m.vscode_bp.bp1 ++ : if m.vscode_bp.bp1 >= 1 then STOP
                    print "Hello world"
                end function
            `);
        });

        it('injects regular stop when hit condition is 0', () => {
            expect(bpWriter.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, 'main.brs',
                <any>[{
                    line: 3,
                    hitCondition: '0'
                }]).code).to.equal(`
                function Main()\nSTOP
                    print "Hello world"
                end function
            `);
        });

        it('injects logMessage', () => {
            expect(bpWriter.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, 'main.brs',
                <any>[{
                    line: 3,
                    logMessage: 'test print'
                }]).code).to.equal(`
                function Main()\nPRINT "test print"
                    print "Hello world"
                end function
            `);
        });

        it('injects logMessage with interpolated values', () => {
            expect(bpWriter.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, 'main.brs',
                <any>[{
                    line: 3,
                    logMessage: 'hello {name}, how is {city}'
                }]).code).to.equal(`
                function Main()\nPRINT "hello "; name;", how is "; city;""
                    print "Hello world"
                end function
            `);
        });

        it('generates valid source map', async () => {
            let result = bpWriter.getSourceAndMapWithBreakpoints(`
                function Main()
                    print "Hello world"
                end function
            `, 'main.brs',
                <any>[{
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
            var breakpoints = bpWriter.replaceBreakpoints(n(`${cwd}/file.brs`), [{
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
            bpWriter.lockBreakpoints();
            let breakpoints = bpWriter.replaceBreakpoints(n(`${cwd}/file.brs`), [{
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
            let breakpoints = bpWriter.replaceBreakpoints(s`${cwd}/file.brs`, [{
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
            bpWriter.lockBreakpoints();

            //simulate user deleting all breakpoints
            breakpoints = bpWriter.replaceBreakpoints(s`${cwd}/file.brs`, []);

            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                verified: true,
                isHidden: true
            });

            //simulate user adding a breakpoint to the same place it had been before
            breakpoints = bpWriter.replaceBreakpoints(s`${cwd}/file.brs`, [{
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
        let tmpDir = s`${cwd}/.tmp`;
        let rootDir = s`${tmpDir}/rokuProject`;
        let outDir = s`${tmpDir}/out`;
        let stagingDir = s`${tmpDir}/staging`;
        let sourceDir1 = s`${tmpDir}/source1`;
        let sourceDir2 = s`${tmpDir}/source2`;

        beforeEach(() => {
            fsExtra.ensureDirSync(`${rootDir}/source`);
            fsExtra.ensureDirSync(`${stagingDir}/source`);
            fsExtra.ensureDirSync(`${tmpDir}/source`);
            fsExtra.ensureDirSync(`${sourceDir1}/source`);
            fsExtra.ensureDirSync(`${sourceDir2}/source`);
        });

        afterEach(() => {
            fsExtra.removeSync(tmpDir);
        });

        it('works with normal flow', async () => {
            fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //set the breakpoint before launch
            bpWriter.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 3
            }]);

            fsExtra.ensureDirSync(`${stagingDir}/source`);
            //copy the file to staging
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //launch
            bpWriter.lockBreakpoints();

            //file was copied to staging
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs`)).to.be.true;
            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.false;

            await bpWriter.writeBreakpointsForProject(new Project(<any>{
                rootDir: rootDir,
                outDir: outDir,
                stagingFolderPath: stagingDir
            }));

            //it wrote the breakpoint in the correct location
            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);

            //sourcemap was created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.true;

            //sourcemap points to correct location (notice we ask about line 4, but get back line 3)
            expect(await sourceMapManager.getOriginalLocation(`${stagingDir}/source/main.brs`, 4, 0)).to.eql({
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
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpWriter.replaceBreakpoints(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpWriter.lockBreakpoints();

            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.false;

            await bpWriter.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);

            //sourcemap was created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.true;

            //sourcemap points to correct location (notice we ask about line 4, but get back line 3)
            expect(await sourceMapManager.getOriginalLocation(`${stagingDir}/source/main.brs`, 4, 0)).to.eql({
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
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpWriter.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpWriter.lockBreakpoints();

            await bpWriter.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });

        it('properly writes all types of breakpoints', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir2}/source/main.brs`, `
                sub main()
                    firstName="john"
                    print lastName="smith"
                    print firstName + " " + lastName
                end sub
            `);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir2}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpWriter.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0,
                condition: 'true = true'
            }, {
                line: 4,
                column: 0,
                logMessage: 'Hello {lastName}'
            }, {
                line: 5,
                column: 0,
                hitCondition: '3'
            }]);

            //launch
            bpWriter.lockBreakpoints();

            await bpWriter.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`
                sub main()\nif true = true then : STOP : end if
                    firstName="john"\nPRINT "Hello "; lastName;""
                    print lastName="smith"\nif Invalid = m.vscode_bp OR Invalid = m.vscode_bp.bp1 then if Invalid = m.vscode_bp then m.vscode_bp = {bp1: 0} else m.vscode_bp.bp1 = 0 else m.vscode_bp.bp1 ++ : if m.vscode_bp.bp1 >= 3 then STOP
                    print firstName + " " + lastName
                end sub
            `);

        });

        it('does not duplicate breakpoints with breakpoint set in both sourceDir files', async () => {
            //create file
            fsExtra.writeFileSync(`${sourceDir1}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //duplicate file in sourceDir2
            fsExtra.copyFileSync(`${sourceDir1}/source/main.brs`, `${sourceDir2}/source/main.brs`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copyFileSync(`${sourceDir2}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpWriter.replaceBreakpoints(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);
            bpWriter.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //launch
            bpWriter.lockBreakpoints();

            await bpWriter.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });
    });

    describe('writeBreakpointsToFile', () => {
        it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
            fsExtra.ensureDirSync(s`${tmpDir}/dist`);
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
            fsExtra.writeFileSync(s`${tmpDir}/dist/main.brs`, result.code);
            fsExtra.writeFileSync(s`${tmpDir}/dist/main.brs.map`, result.map.toString());

            fsExtra.writeFileSync(s`${stagingDir}/main.brs`, result.code);
            fsExtra.writeFileSync(s`${stagingDir}/main.brs.map`, result.map.toString());

            //set a few breakpoints in the source files
            bpWriter.registerBreakpoint(src, {
                line: 5
            });
            bpWriter.registerBreakpoint(src, {
                line: 7
            });

            await bpWriter.writeBreakpointsForProject(new Project({
                files: [
                    'main.brs'
                ],
                rootDir: s`${tmpDir}/dist`,
                outDir: s`${tmpDir}/out`,
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
        it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
            var sourceFilePath = s`${srcDir}/source/main.bs`;
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
                n(3, 0, '    '), n(3, 4, 'print'), ' ', n(3, 11, '1'), '\n',
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
                    column: 4,
                    source: sourceFilePath,
                    //bias is critical. Without this, we would default to the last char of previous line
                    bias: SourceMapConsumer.LEAST_UPPER_BOUND
                });
            });
            expect(position).to.include({
                line: 2,
                column: 4
            });

            bpWriter.registerBreakpoint(sourceFilePath, {
                line: 3,
                column: 0
            });

            await bpWriter.writeBreakpointsForProject(new Project({
                files: [
                    'source/main.brs'
                ],
                stagingFolderPath: stagingDir,
                outDir: outDir,
                rootDir: rootDir
            }));

            //use sourcemap to look up original location
            let location = await locationManager.getSourceLocation({
                stagingFilePath: s`${stagingDir}/source/main.brs`,
                columnIndex: 0,
                lineNumber: 2,
                fileMappings: [],
                rootDir: rootDir,
                stagingFolderPath: stagingDir,
                enableSourceMaps: true
            });

            expect(location).to.include({
                columnIndex: 0,
                lineNumber: 3,
                filePath: sourceFilePath
            } as SourceLocation);
        });

        it('replaces in-memory cache when creating breakpoint source map', async () => {
            let sourceFilePath = s`${srcDir}/source/main.brs`;
            function n(line, col, txt) {
                return new SourceNode(line, col, sourceFilePath, txt);
            }
            //the original file had spaces between each print line
            let codeAndMap = new SourceNode(null, null, sourceFilePath, [
                n(1, 0, 'sub Main(inputARguments as object)\n'),
                n(2, 0, '    print "first"\n'),
                n(3, 0, '    print "second"\n'),
                n(7, 0, 'end sub')
            ]).toStringWithSourceMap();

            //copy to rootDir
            await fsExtra.writeFileSync(`${rootDir}/source/main.brs`, codeAndMap.code);
            await fsExtra.writeFileSync(`${rootDir}/source/main.brs.map`, codeAndMap.map.toString());

            //copy to staging
            await fsExtra.writeFileSync(`${stagingDir}/source/main.brs`, codeAndMap.code);
            await fsExtra.writeFileSync(`${stagingDir}/source/main.brs.map`, codeAndMap.map.toString());

            //the sourcemap in staging should point to src
            expect(
                (await sourceMapManager.getSourceMap(`${stagingDir}/source/main.brs.map`)).sources
            ).to.eql([
                sourceFilePath
            ]);

            //write breakpoints
            bpWriter.registerBreakpoint(sourceFilePath, {
                line: 4,
                column: 0
            });

            await bpWriter.writeBreakpointsForProject(new Project({
                files: [
                    'source/main.brs'
                ],
                stagingFolderPath: stagingDir,
                outDir: outDir,
                rootDir: rootDir
            }));

            //the in-memory cached source map should have been updated to point to rootDir
            expect(
                (await sourceMapManager.getSourceMap(`${stagingDir}/source/main.brs.map`)).sources
            ).to.eql([
                s`${rootDir}/source/main.brs`
            ]);
        });
    });

    it('properly handles roku-deploy file overriding', async () => {
        let baseDir = s`${tmpDir}/base`;
        let baseFilePath = s`${baseDir}/source/environment.brs`;
        fsExtra.ensureDirSync(s`${baseDir}/source`);
        fsExtra.writeFileSync(baseFilePath, `
            sub GetEnvironmentName()
                return "base"
            end sub
        `);

        //write breakpoints
        bpWriter.registerBreakpoint(baseFilePath, {
            line: 2,
            column: 0
        });
        let project = new Project({
            files: [
                'source/**/*',
                //override the source file with the one from base
                {
                    src: '../base/**/*',
                    dest: ''
                }
            ],
            stagingFolderPath: stagingDir,
            outDir: outDir,
            rootDir: rootDir
        });
        await project.stage();
        await bpWriter.writeBreakpointsForProject(project);

        //the source map for version.brs should point to base, not main
        let source = await sourceMapManager.getSourceMap(s`${stagingDir}/source/environment.brs.map`);
        expect(source.sources).to.eql([
            baseFilePath
        ]);
    });
});
