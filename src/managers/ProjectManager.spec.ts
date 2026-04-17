import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { util } from '../util';
import { rokuDeploy } from 'roku-deploy';
import * as sinonActual from 'sinon';
import { fileUtils, standardizePath as s } from '../FileUtils';
import type { ComponentLibraryConstructorParams } from './ProjectManager';
import { Project, ComponentLibraryProject, ProjectManager } from './ProjectManager';
import { BreakpointManager } from './BreakpointManager';
import { SourceMapManager } from './SourceMapManager';
import { LocationManager } from './LocationManager';
import * as decompress from 'decompress';

let sinon = sinonActual.createSandbox();
let n = fileUtils.standardizePath.bind(fileUtils);

let cwd = fileUtils.standardizePath(process.cwd());
let tempPath = s`${cwd}/.tmp`;
let rootDir = s`${tempPath}/rootDir`;
let outDir = s`${tempPath}/outDir`;
let stagingDir = s`${outDir}/stagingDir`;
let compLibOutDir = s`${outDir}/component-libraries`;
let compLibstagingDir = s`${rootDir}/component-libraries/CompLibA`;

beforeEach(() => {
    fsExtra.ensureDirSync(tempPath);
    fsExtra.emptyDirSync(tempPath);
    sinon.restore();
});
afterEach(() => {
    fsExtra.ensureDirSync(tempPath);
    fsExtra.emptyDirSync(tempPath);
});

describe('ProjectManager', () => {
    let manager: ProjectManager;
    beforeEach(() => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        let sourceMapManager = new SourceMapManager();
        let locationManager = new LocationManager(sourceMapManager);
        let breakpointManager = new BreakpointManager(sourceMapManager, locationManager);

        manager = new ProjectManager({
            locationManager: locationManager,
            breakpointManager: breakpointManager
        });

        manager.mainProject = <any>{
            stagingDir: stagingDir
        };
        manager.componentLibraryProjects.push(<any>{
            stagingDir: compLibstagingDir,
            libraryIndex: 1,
            outDir: compLibOutDir
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getLineNumberOffsetByBreakpoints', () => {
        let filePath = 'does not matter';
        it('accounts for the entry breakpoint', () => {
            manager['breakpointManager']['permanentBreakpointsBySrcPath'].set(filePath, [{
                line: 3
            }, {
                line: 3
            }] as any);
            //no offset because line is before any breakpoints
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 1)).to.equal(1);
            //after the breakpoints, should be offset by -1
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 4)).to.equal(3);
        });

        it('works with zero breakpoints', () => {
            //no offset because line is before any breakpoints
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 1)).to.equal(1);
            //after the breakpoints, should be offset by -1
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 4)).to.equal(4);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 12)).to.equal(12);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 50)).to.equal(50);
        });

        it('works for a complex file', () => {
            //original file (star means breakpoint)
            /**
                 function main ()
                    line = 2
                 *  line = 3
                 *  line = 4
                 *  line = 5
                 *  line = 6
                    line = 7
                 *  line = 8
                    line = 9
                 *  line = 10
                    line = 11
                 *  line = 12
                end function
             */

            //modified file
            /**
                 function main ()
                        line = 2
                    STOP
                        line = 3
                    STOP
                        line = 4
                    STOP
                        line = 5
                    STOP
                        line = 6
                        line = 7
                    STOP
                        line = 8
                        line = 9
                    STOP
                        line = 10
                        line = 11
                    STOP
                        line = 12
                end function
             */
            manager['breakpointManager']['permanentBreakpointsBySrcPath'].set(filePath, [
                { line: 3 },
                { line: 4 },
                { line: 5 },
                { line: 6 },
                { line: 8 },
                { line: 10 },
                { line: 12 }
            ] as any);
            //no offset because line is before any breakpoints
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 1)).to.equal(1);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 2)).to.equal(2);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 3)).to.equal(3);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 4)).to.equal(3);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 5)).to.equal(4);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 6)).to.equal(4);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 7)).to.equal(5);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 8)).to.equal(5);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 9)).to.equal(6);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 10)).to.equal(6);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 11)).to.equal(7);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 12)).to.equal(8);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 13)).to.equal(8);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 14)).to.equal(9);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 15)).to.equal(10);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 16)).to.equal(10);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 17)).to.equal(11);
            //breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 18)).to.equal(12);
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 19)).to.equal(12);
            //no breakpoint
            expect(manager.getLineNumberOffsetByBreakpoints(filePath, 20)).to.equal(13);

        });
    });

    describe('getStagingFileInfo', () => {
        it('finds standard files in main project', async () => {
            expect(
                await manager.getStagingFileInfo('pkg:/source/main.brs')
            ).to.include({
                absolutePath: s`${stagingDir}/source/main.brs`,
                //the relative path should not include a leading slash
                relativePath: s`source/main.brs`
            });
        });

        it(`searches for partial files in main project when '...' is encountered`, async () => {
            let stub = sinon.stub(fileUtils, 'findPartialFileInDirectory').callsFake((partialFilePath, directoryPath) => {
                expect(partialFilePath).to.equal('...ource/main.brs');
                expect(directoryPath).to.equal(manager.mainProject.stagingDir);
                return Promise.resolve(`source/main.brs`);
            });
            expect(
                (await manager.getStagingFileInfo('...ource/main.brs')).absolutePath
            ).to.equal(
                s`${stagingDir}/source/main.brs`
            );
            expect(stub.called).to.be.true;
        });

        it(`detects full paths to component library filenames`, async () => {
            expect(
                (await manager.getStagingFileInfo('pkg:/source/main__lib1.brs')).absolutePath
            ).to.equal(
                s`${compLibstagingDir}/source/main__lib1.brs`
            );
        });

        it(`detects partial paths to component library filenames`, async () => {
            let stub = sinon.stub(fileUtils, 'findPartialFileInDirectory').callsFake((partialFilePath, directoryPath) => {
                expect(partialFilePath).to.equal('...ource/main__lib1.brs');
                expect(directoryPath).to.equal(manager.componentLibraryProjects[0].stagingDir);
                return Promise.resolve(`source/main__lib1.brs`);
            });
            let info = await manager.getStagingFileInfo('...ource/main__lib1.brs');
            expect(info).to.deep.include({
                relativePath: s`source/main__lib1.brs`,
                absolutePath: s`${compLibstagingDir}/source/main__lib1.brs`
            });
            expect(info.project).to.include({
                outDir: compLibOutDir
            });

            expect(stub.called).to.be.true;
        });
    });

    describe('getSourceLocation', () => {
        it('resolves a pkg path back to the original rootDir source file via a relative sourcemap', async () => {
            // Simulate the full flow:
            // 1. compiler produces MainScene.brs + MainScene.brs.map in srcDir, with sources relative to srcDir
            // 2. prepublishToStaging copies them to stagingDir (recorded in fileMappings)
            // 3. preprocessStagingFiles rewrites the map's sources to be relative to stagingDir
            // 4. getSourceLocation('pkg:/source/MainScene.brs', 1) resolves back to rootDir/source/MainScene.bs

            const srcDir = s`${tempPath}/srcDir/source`;
            const originalBsFile = s`${rootDir}/source/MainScene.bs`;
            const originalMapPath = s`${srcDir}/MainScene.brs.map`;
            const stagingBrsPath = s`${stagingDir}/source/MainScene.brs`;
            const stagingMapPath = s`${stagingDir}/source/MainScene.brs.map`;

            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(path.dirname(stagingBrsPath));
            fsExtra.ensureDirSync(path.dirname(originalBsFile));
            fsExtra.writeFileSync(originalBsFile, `sub main()\n    print "hello"\nend sub`);
            fsExtra.writeFileSync(stagingBrsPath, `sub main()\n    print "hello"\nend sub`);

            // Source map produced by compiler in srcDir — source is relative from srcDir back to rootDir
            const { SourceMapGenerator } = await import('source-map');
            const gen = new SourceMapGenerator({ file: 'MainScene.brs' });
            gen.addMapping({
                generated: { line: 1, column: 0 },
                original: { line: 1, column: 0 },
                source: path.relative(srcDir, originalBsFile)
            });
            fsExtra.writeFileSync(originalMapPath, gen.toString());
            fsExtra.copySync(originalMapPath, stagingMapPath);

            // fileMappings records the src->dest move that prepublishToStaging performed
            const fileMappings = [
                { src: originalBsFile, dest: stagingBrsPath },
                { src: originalMapPath, dest: stagingMapPath }
            ];

            // preprocessStagingFiles rewrites the on-disk map to use paths relative to stagingDir
            const project = new Project({ rootDir: rootDir, outDir: outDir, files: [], stagingDir: stagingDir, enhanceREPLCompletions: false });
            project.fileMappings = fileMappings;
            await project['preprocessStagingFiles']();

            // Point the manager's mainProject at this project
            manager.mainProject = project as any;

            const sourceLocation = await manager.getSourceLocation('pkg:/source/MainScene.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(originalBsFile));
            expect(sourceLocation.lineNumber).to.equal(1);
        });

        it(`does not crash when file is missing`, async () => {
            manager.mainProject.fileMappings = [];
            let sourceLocation = await manager.getSourceLocation('pkg:/source/file-we-dont-know-about.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${stagingDir}/source/file-we-dont-know-about.brs`));
        });

        it('handles truncated paths', async () => {
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra as any, 'pathExists').callsFake((filePath: string) => {
                if (fileUtils.pathEndsWith(filePath, '.map')) {
                    return Promise.resolve(false);
                } else {
                    return Promise.resolve(true);
                }
            });
            sinon.stub(fileUtils, 'getAllRelativePaths').returns(Promise.resolve([
                'source/file1.brs',
                'source/file2.brs'
            ]));
            manager.mainProject.rootDir = rootDir;
            manager.mainProject.stagingDir = stagingDir;
            manager.mainProject.fileMappings = [{
                src: s`${rootDir}/source/file1.brs`,
                dest: s`${stagingDir}/source/file1.brs`
            }, {
                src: s`${rootDir}/source/file2.brs`,
                dest: s`${stagingDir}/source/file2.brs`
            }];

            let sourceLocation = await manager.getSourceLocation('...rce/file1.brs', 1);
            expect(sourceLocation).to.exist;
            expect(n(sourceLocation.filePath)).to.equal(s`${rootDir}/source/file1.brs`);

            sourceLocation = await manager.getSourceLocation('...rce/file2.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(s`${rootDir}/source/file2.brs`);
        });

        it('handles pkg paths', async () => {
            //mock fsExtra so we don't have to create actual files
            sinon.stub(fsExtra as any, 'pathExists').callsFake((filePath: string) => {
                if (fileUtils.pathEndsWith(filePath, '.map')) {
                    return Promise.resolve(false);
                } else {
                    return Promise.resolve(true);
                }
            });
            manager.mainProject.rootDir = rootDir;
            manager.mainProject.stagingDir = stagingDir;
            manager.mainProject.fileMappings = [{
                src: s`${rootDir}/source/file1.brs`,
                dest: s`${stagingDir}/source/file1.brs`
            }, {
                src: s`${rootDir}/source/file2.brs`,
                dest: s`${stagingDir}/source/file2.brs`
            }];

            let sourceLocation = await manager.getSourceLocation('pkg:source/file1.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${rootDir}/source/file1.brs`));

            sourceLocation = await manager.getSourceLocation('pkg:source/file2.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${rootDir}/source/file2.brs`));

            sourceLocation = await manager.getSourceLocation('pkg:/source/file2.brs', 1);
            expect(n(sourceLocation.filePath)).to.equal(n(`${rootDir}/source/file2.brs`));
        });
    });
});

describe('Project', () => {
    let project: Project;
    const rdbFilesBasePath = 'rdbSource';
    beforeEach(() => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        sinon.stub(console, 'error').callsFake((...args) => { });
        project = new Project({
            rootDir: cwd,
            outDir: outDir,
            files: ['a'],
            bsConst: { b: true },
            injectRaleTrackerTask: true,
            injectRdbOnDeviceComponent: true,
            rdbFilesBasePath: rdbFilesBasePath,
            sourceDirs: [s`${cwd}/source1`],
            stagingDir: stagingDir,
            raleTrackerTaskFileLocation: 'z',
            enhanceREPLCompletions: false
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    it('copies the necessary properties onto the instance', () => {
        expect(project.rootDir).to.equal(cwd);
        expect(project.files).to.eql(['a']);
        expect(project.bsConst).to.eql({ b: true });
        expect(project.injectRaleTrackerTask).to.equal(true);
        expect(project.outDir).to.eql(outDir);
        expect(project.sourceDirs).to.eql([s`${cwd}/source1`]);
        expect(project.stagingDir).to.eql(stagingDir);
        expect(project.raleTrackerTaskFileLocation).to.eql('z');
        expect(project.injectRdbOnDeviceComponent).to.equal(true);
        expect(project.rdbFilesBasePath).to.eql(rdbFilesBasePath);
    });

    describe('stage', () => {
        afterEach(() => {
            try {
                fsExtra.removeSync(tempPath);
            } catch (e) { }
        });
        it('actually stages the project', async () => {
            project.raleTrackerTaskFileLocation = undefined;
            project.rootDir = rootDir;
            project.outDir = outDir;
            project.stagingDir = stagingDir;
            fsExtra.ensureDirSync(project.rootDir);
            fsExtra.ensureDirSync(project.outDir);
            fsExtra.ensureDirSync(project.stagingDir);

            fsExtra.writeFileSync(s`${project.rootDir}/manifest`, 'bs_const=b=true');
            project.files = [
                'manifest'
            ];
            await project.stage();
            expect(fsExtra.pathExistsSync(`${stagingDir}/manifest`)).to.be.true;
        });
    });

    describe('getSourceMapComment', () => {
        const call = (contents: string) => Project.getSourceMapComment(contents);

        it('returns undefined when no sourceMappingURL comment is present', () => {
            expect(call(`sub main()\nend sub`)).to.be.undefined;
            expect(call(``)).to.be.undefined;
        });

        it('returns the correct named fields for a standard brs comment', () => {
            const result = call(`sub main()\nend sub\n'//# sourceMappingURL=main.brs.map`);
            expect(result).to.exist;
            expect(result.fullMatch).to.equal(`'//# sourceMappingURL=main.brs.map`);
            expect(result.leadingInfo).to.equal(`'`);
            expect(result.wholeComment).to.equal(`//# sourceMappingURL=main.brs.map`);
            expect(result.mapPath).to.equal(`main.brs.map`);
        });

        it('returns the correct named fields for a standard xml comment', () => {
            const result = call(`<component>\n</component>\n<!--//# sourceMappingURL=main.xml.map -->`);
            expect(result).to.exist;
            // fullMatch does not include the trailing ' -->' (it's consumed by the non-capturing (?:|-->) group)
            expect(result.fullMatch).to.equal(`<!--//# sourceMappingURL=main.xml.map`);
            expect(result.leadingInfo).to.equal(`<!--`);
            expect(result.wholeComment).to.equal(`//# sourceMappingURL=main.xml.map`);
            expect(result.mapPath).to.equal(`main.xml.map`);
        });

        it('returns the correct named fields for a standard js-style comment', () => {
            const result = call(`//# sourceMappingURL=main.js.map`);
            expect(result).to.exist;
            expect(result.fullMatch).to.equal(`//# sourceMappingURL=main.js.map`);
            expect(result.leadingInfo).to.equal(``);
            expect(result.wholeComment).to.equal(`//# sourceMappingURL=main.js.map`);
            expect(result.mapPath).to.equal(`main.js.map`);
        });

        it('returns the last comment when multiple are present', () => {
            const result = call(`'//# sourceMappingURL=first.brs.map\ncode\n'//# sourceMappingURL=last.brs.map`);
            expect(result?.mapPath).to.equal(`last.brs.map`);
        });

        it('captures an absolute path in mapPath', () => {
            const result = call(`'//# sourceMappingURL=/absolute/path/to/main.brs.map`);
            expect(result?.mapPath).to.equal(`/absolute/path/to/main.brs.map`);
        });

        it('captures a relative path with directory traversal in mapPath', () => {
            const result = call(`'//# sourceMappingURL=../../maps/main.brs.map`);
            expect(result?.mapPath).to.equal(`../../maps/main.brs.map`);
        });

        it('leadingInfo preserves whitespace before the comment character', () => {
            const result = call(`  '//# sourceMappingURL=main.brs.map`);
            expect(result?.leadingInfo).to.equal(`  '`);
        });

        describe('legacy and variant forms', () => {
            it('brs: legacy @ form', () => {
                const result = call(`'//@ sourceMappingURL=main.brs.map`);
                expect(result?.fullMatch).to.equal(`'//@ sourceMappingURL=main.brs.map`);
                expect(result?.leadingInfo).to.equal(`'`);
                expect(result?.mapPath).to.equal(`main.brs.map`);
            });

            it('brs: // omitted', () => {
                expect(call(`'# sourceMappingURL=main.brs.map`)?.mapPath).to.equal(`main.brs.map`);
            });

            it('xml: // omitted', () => {
                const result = call(`<!--# sourceMappingURL=main.xml.map -->`);
                expect(result?.leadingInfo).to.equal(`<!--`);
                expect(result?.mapPath).to.equal(`main.xml.map`);
            });

            it('xml: whitespace between <!-- and //#', () => {
                const result = call(`<!--  //# sourceMappingURL=main.xml.map -->`);
                expect(result?.leadingInfo).to.equal(`<!--  `);
                expect(result?.mapPath).to.equal(`main.xml.map`);
            });

            it('no space between # and sourceMappingURL', () => {
                expect(call(`'//# sourceMappingURL=main.brs.map`)?.mapPath).to.equal(`main.brs.map`);
            });
        });
    });

    describe('preprocessStagingFiles', () => {
        afterEach(() => {
            try {
                fsExtra.removeSync(tempPath);
            } catch (e) { }
        });

        it('rewrites sources paths in map files that were moved to staging', async () => {
            // Simulate a .map file that was compiled in a source dir, then copied to a different stagingDir
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            // The map's original location is in srcDir
            const originalMapPath = s`${srcDir}/main.brs.map`;
            // The original .bs file is one level up from the map file
            const originalSourceMap = {
                version: 3,
                sources: ['../../rootDir/source/main.bs'],
                mappings: ''
            };
            fsExtra.writeJsonSync(originalMapPath, originalSourceMap);

            // Copy to staging (simulating what prepublishToStaging does)
            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            // Set up fileMappings to record the move
            project.fileMappings = [
                { src: originalMapPath, dest: stagingMapPath }
            ];

            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            // Resolve what the source path should be after rewriting
            const absoluteSource = path.resolve(path.dirname(originalMapPath), '../../rootDir/source/main.bs');
            const expectedRelative = s`${path.relative(path.dirname(stagingMapPath), absoluteSource)}`;
            expect(updated.sources[0]).to.equal(expectedRelative);
            expect(updated.sourceRoot).to.be.undefined;
        });

        it('does not modify a map file that is not in fileMappings (generated in staging)', async () => {
            fsExtra.ensureDirSync(stagingDir);
            const mapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(mapPath));
            const originalSourceMap = { version: 3, sources: ['../source/main.bs'], mappings: '' };
            fsExtra.writeJsonSync(mapPath, originalSourceMap);

            // fileMappings does NOT include this map file
            project.fileMappings = [];

            await project['preprocessStagingFiles']();

            const unchanged = fsExtra.readJsonSync(mapPath);
            expect(unchanged.sources[0]).to.equal('../source/main.bs');
        });

        it('rewrites sources correctly when sourceRoot is omitted', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/main.brs.map`;
            // No sourceRoot — sources are relative to the map file's directory
            const originalSourceMap = {
                version: 3,
                sources: ['../../rootDir/source/main.bs'],
                mappings: ''
            };
            fsExtra.writeJsonSync(originalMapPath, originalSourceMap);

            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [
                { src: originalMapPath, dest: stagingMapPath }
            ];

            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            const absoluteSource = path.resolve(path.dirname(originalMapPath), '../../rootDir/source/main.bs');
            const expectedRelative = s`${path.relative(path.dirname(stagingMapPath), absoluteSource)}`;
            expect(updated.sources[0]).to.equal(expectedRelative);
            expect(updated.sourceRoot).to.be.undefined;
        });

        it('rewrites sources correctly when sourceRoot is a relative path', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/main.brs.map`;
            // sourceRoot is relative to the map file's directory; sources are relative to sourceRoot
            const originalSourceMap = {
                version: 3,
                sourceRoot: '../rootDir',
                sources: ['source/main.bs'],
                mappings: ''
            };
            fsExtra.writeJsonSync(originalMapPath, originalSourceMap);

            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [
                { src: originalMapPath, dest: stagingMapPath }
            ];

            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            const absoluteSource = path.resolve(path.dirname(originalMapPath), '../rootDir', 'source/main.bs');
            const expectedRelative = s`${path.relative(path.dirname(stagingMapPath), absoluteSource)}`;
            expect(updated.sources[0]).to.equal(expectedRelative);
            expect(updated.sourceRoot).to.be.undefined;
        });

        it('rewrites sources correctly when sourceRoot is an absolute path', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/main.brs.map`;
            const absoluteSourceRoot = s`${tempPath}/rootDir`;
            // sourceRoot is absolute; sources are relative to sourceRoot
            const originalSourceMap = {
                version: 3,
                sourceRoot: absoluteSourceRoot,
                sources: ['source/main.bs'],
                mappings: ''
            };
            fsExtra.writeJsonSync(originalMapPath, originalSourceMap);

            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [
                { src: originalMapPath, dest: stagingMapPath }
            ];

            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            const absoluteSource = path.resolve(absoluteSourceRoot, 'source/main.bs');
            const expectedRelative = s`${path.relative(path.dirname(stagingMapPath), absoluteSource)}`;
            expect(updated.sources[0]).to.equal(expectedRelative);
            expect(updated.sourceRoot).to.be.undefined;
        });

        it('rewrites all sources in a map with multiple sources', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/main.brs.map`;
            fsExtra.writeJsonSync(originalMapPath, {
                version: 3,
                sources: ['../../rootDir/source/a.bs', '../../rootDir/source/b.bs'],
                mappings: ''
            });

            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [{ src: originalMapPath, dest: stagingMapPath }];
            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            const stagingMapDir = path.dirname(stagingMapPath);
            const originalMapDir = path.dirname(originalMapPath);
            expect(updated.sources[0]).to.equal(s`${path.relative(stagingMapDir, path.resolve(originalMapDir, '../../rootDir/source/a.bs'))}`);
            expect(updated.sources[1]).to.equal(s`${path.relative(stagingMapDir, path.resolve(originalMapDir, '../../rootDir/source/b.bs'))}`);
        });

        it('treats an empty string sourceRoot the same as omitted', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/main.brs.map`;
            fsExtra.writeJsonSync(originalMapPath, {
                version: 3,
                sourceRoot: '',
                sources: ['../../rootDir/source/main.bs'],
                mappings: ''
            });

            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [{ src: originalMapPath, dest: stagingMapPath }];
            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            const absoluteSource = path.resolve(path.dirname(originalMapPath), '../../rootDir/source/main.bs');
            const expectedRelative = s`${path.relative(path.dirname(stagingMapPath), absoluteSource)}`;
            expect(updated.sources[0]).to.equal(expectedRelative);
            expect(updated.sourceRoot).to.be.undefined;
        });

        it('rewrites sources correctly for a map nested deep in a subdirectory', async () => {
            const srcDir = s`${tempPath}/srcDir/components/views/details`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/Details.brs.map`;
            fsExtra.writeJsonSync(originalMapPath, {
                version: 3,
                sources: ['../../../../src/components/views/details/Details.bs'],
                mappings: ''
            });

            const stagingMapPath = s`${stagingDir}/components/views/details/Details.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [{ src: originalMapPath, dest: stagingMapPath }];
            await project['preprocessStagingFiles']();

            const updated = fsExtra.readJsonSync(stagingMapPath);
            const absoluteSource = path.resolve(path.dirname(originalMapPath), '../../../../src/components/views/details/Details.bs');
            const expectedRelative = s`${path.relative(path.dirname(stagingMapPath), absoluteSource)}`;
            expect(updated.sources[0]).to.equal(expectedRelative);
            expect(updated.sourceRoot).to.be.undefined;
        });

        it('rewrites multiple map files in a single pass', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPathA = s`${srcDir}/a.brs.map`;
            const originalMapPathB = s`${srcDir}/b.brs.map`;
            fsExtra.writeJsonSync(originalMapPathA, { version: 3, sources: ['../../rootDir/a.bs'], mappings: '' });
            fsExtra.writeJsonSync(originalMapPathB, { version: 3, sources: ['../../rootDir/b.bs'], mappings: '' });

            const stagingMapPathA = s`${stagingDir}/source/a.brs.map`;
            const stagingMapPathB = s`${stagingDir}/source/b.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPathA));
            fsExtra.copySync(originalMapPathA, stagingMapPathA);
            fsExtra.copySync(originalMapPathB, stagingMapPathB);

            project.fileMappings = [
                { src: originalMapPathA, dest: stagingMapPathA },
                { src: originalMapPathB, dest: stagingMapPathB }
            ];
            await project['preprocessStagingFiles']();

            const stagingMapDir = path.dirname(stagingMapPathA);
            const originalMapDir = path.dirname(originalMapPathA);
            const updatedA = fsExtra.readJsonSync(stagingMapPathA);
            const updatedB = fsExtra.readJsonSync(stagingMapPathB);
            expect(updatedA.sources[0]).to.equal(s`${path.relative(stagingMapDir, path.resolve(originalMapDir, '../../rootDir/a.bs'))}`);
            expect(updatedB.sources[0]).to.equal(s`${path.relative(stagingMapDir, path.resolve(originalMapDir, '../../rootDir/b.bs'))}`);
        });

        it('does not crash when map has no sources field', async () => {
            const srcDir = s`${tempPath}/srcDir/source`;
            fsExtra.ensureDirSync(srcDir);
            fsExtra.ensureDirSync(stagingDir);

            const originalMapPath = s`${srcDir}/main.brs.map`;
            fsExtra.writeJsonSync(originalMapPath, { version: 3, mappings: '' });

            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.copySync(originalMapPath, stagingMapPath);

            project.fileMappings = [{ src: originalMapPath, dest: stagingMapPath }];

            // should not throw
            await project['preprocessStagingFiles']();

            // file should be unchanged
            const unchanged = fsExtra.readJsonSync(stagingMapPath);
            expect(unchanged.sources).to.be.undefined;
        });

        it('does not crash when map contains invalid JSON', async () => {
            fsExtra.ensureDirSync(stagingDir);
            const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
            fsExtra.ensureDirSync(path.dirname(stagingMapPath));
            fsExtra.writeFileSync(stagingMapPath, 'not-valid-json');

            project.fileMappings = [{ src: s`${tempPath}/srcDir/main.brs.map`, dest: stagingMapPath }];

            // should not throw
            await project['preprocessStagingFiles']();
        });

        describe('fixSourceMapComment', () => {
            /**
             * Stage a source file (with a sourceMappingURL comment) and its map, run
             * preprocessStagingFiles, and return the updated staged file contents.
             *
             * originalDir/main<ext> has the comment pointing at originalMapDir/main<ext>.map.
             * The source file is always staged to stagingDir/source/main<ext>.
             * The map is staged to stagingMapDest (default: stagingDir/source/main<ext>.map).
             */
            async function stageFileWithComment(ext: string, commentLine: string, opts: {
                originalDir?: string;
                originalMapDir?: string;
                stageMap?: boolean;
                stagingMapDest?: string;
            } = {}) {
                const {
                    originalDir = s`${tempPath}/src/components/views`,
                    originalMapDir = s`${tempPath}/src/components/maps`,
                    stageMap = true,
                    stagingMapDest = s`${stagingDir}/source/main${ext}.map`
                } = opts;
                const originalPath = s`${originalDir}/main${ext}`;
                const originalMapPath = s`${originalMapDir}/main${ext}.map`;
                const stagingPath = s`${stagingDir}/source/main${ext}`;

                fsExtra.ensureDirSync(path.dirname(originalPath));
                fsExtra.ensureDirSync(path.dirname(originalMapPath));
                fsExtra.ensureDirSync(path.dirname(stagingPath));

                fsExtra.writeFileSync(originalPath, `content\n${commentLine}`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });
                fsExtra.copySync(originalPath, stagingPath);

                if (stageMap) {
                    fsExtra.ensureDirSync(path.dirname(stagingMapDest));
                    fsExtra.copySync(originalMapPath, stagingMapDest);
                    project.fileMappings = [
                        { src: originalPath, dest: stagingPath },
                        { src: originalMapPath, dest: stagingMapDest }
                    ];
                } else {
                    project.fileMappings = [{ src: originalPath, dest: stagingPath }];
                }

                await project['preprocessStagingFiles']();
                return fsExtra.readFileSync(stagingPath, 'utf8');
            }

            /**
             * Stage a source file with NO sourceMappingURL comment but with a colocated .map
             * next to the original, run preprocessStagingFiles, and return the staged file contents.
             *
             * When stageMap is true the map is staged to stagingMapDest
             * (default: right next to the source file, i.e. stagingDir/source/main<ext>.map).
             */
            async function stageFileWithColocatedMap(ext: string, opts: {
                stageMap?: boolean;
                stagingMapDest?: string;
                crlf?: boolean;
            } = {}) {
                const srcDir = s`${tempPath}/rootDir/source`;
                const originalPath = s`${srcDir}/main${ext}`;
                const originalMapPath = s`${srcDir}/main${ext}.map`;
                const stagingPath = s`${stagingDir}/source/main${ext}`;
                const {
                    stageMap = false,
                    stagingMapDest = s`${stagingDir}/source/main${ext}.map`,
                    crlf = false
                } = opts;

                fsExtra.ensureDirSync(srcDir);
                fsExtra.ensureDirSync(path.dirname(stagingPath));

                fsExtra.writeFileSync(originalPath, crlf ? `sub main()\r\nend sub` : `sub main()\nend sub`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });
                fsExtra.copySync(originalPath, stagingPath);

                if (stageMap) {
                    fsExtra.ensureDirSync(path.dirname(stagingMapDest));
                    fsExtra.copySync(originalMapPath, stagingMapDest);
                    project.fileMappings = [
                        { src: originalPath, dest: stagingPath },
                        { src: originalMapPath, dest: stagingMapDest }
                    ];
                } else {
                    project.fileMappings = [{ src: originalPath, dest: stagingPath }];
                }

                await project['preprocessStagingFiles']();
                return fsExtra.readFileSync(stagingPath, 'utf8');
            }

            // ── comment rewrite: map not in fileMappings ─────────────────────────────
            it('rewrites the comment to point at the colocated map even when the map was not in fileMappings', async () => {
                const rootDirSource = s`${tempPath}/alpha/beta/charlie/rootDir/source`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;

                const originalRelative = s`${path.relative(rootDirSource, s`${tempPath}/alpha/maps/main.brs.map`)}`;
                const result = await stageFileWithComment('.brs', `'//# sourceMappingURL=${originalRelative}`, {
                    originalDir: rootDirSource,
                    originalMapDir: s`${tempPath}/alpha/maps`,
                    stageMap: false
                });

                // The map should have been copied right next to the staging file
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been colocated next to the staging file').to.be.true;
                // The comment should now point at the colocated copy
                const commentMatch = /'\/\/# sourceMappingURL=(.+)$/.exec(result);
                expect(commentMatch, 'sourceMappingURL comment should still be present').to.exist;
                expect(fileUtils.standardizePath(path.resolve(path.dirname(stagingBrsPath), commentMatch[1]))).to.equal(stagingMapPath);
            });

            // ── comment rewrite: map staged ───────────────────────────────────────────
            it('rewrites the brs comment to point at the staged map', async () => {
                const result = await stageFileWithComment('.brs', `'//# sourceMappingURL=../maps/main.brs.map`);
                expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
            });

            it('rewrites the xml comment to point at the staged map', async () => {
                const result = await stageFileWithComment('.xml', `<!--//# sourceMappingURL=../maps/main.xml.map -->`);
                expect(result).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
            });

            it('rewrites the comment in an arbitrary text-based file format', async () => {
                const result = await stageFileWithComment('.md', `//# sourceMappingURL=../maps/main.md.map`);
                expect(result).to.equal(`content\n//# sourceMappingURL=main.md.map`);
            });

            it('keeps the correct path when brs and map are siblings in both source and staging', async () => {
                const result = await stageFileWithComment('.brs', `'//# sourceMappingURL=main.brs.map`, {
                    originalDir: s`${tempPath}/src/source`,
                    originalMapDir: s`${tempPath}/src/source`
                });
                expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
            });

            it('rewrites an absolute comment path to point at the colocated map in staging', async () => {
                const absoluteMapPath = s`${tempPath}/src/source/main.brs.map`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
                const result = await stageFileWithComment('.brs', `'//# sourceMappingURL=${absoluteMapPath}`, {
                    originalDir: s`${tempPath}/src/source`,
                    originalMapDir: s`${tempPath}/src/source`,
                    stageMap: false
                });
                // Map should be colocated next to the staging file
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been colocated').to.be.true;
                // Comment should point at the colocated copy (relative path = 'main.brs.map')
                expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
            });

            it('uses the last comment when multiple sourceMappingURL comments exist in one file', async () => {
                // Only the last comment should be rewritten; the first should be left as-is.
                const originalDir = s`${tempPath}/src/source`;
                const originalMapDir = s`${tempPath}/src/source`;
                const originalPath = s`${originalDir}/main.brs`;
                const originalMapPath = s`${originalMapDir}/main.brs.map`;
                const stagingPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;

                fsExtra.ensureDirSync(originalDir);
                fsExtra.ensureDirSync(path.dirname(stagingPath));
                fsExtra.writeFileSync(originalPath, `line1\n'//# sourceMappingURL=first.brs.map\nline2\n'//# sourceMappingURL=main.brs.map`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });
                fsExtra.copySync(originalPath, stagingPath);
                fsExtra.copySync(originalMapPath, stagingMapPath);
                project.fileMappings = [
                    { src: originalPath, dest: stagingPath },
                    { src: originalMapPath, dest: stagingMapPath }
                ];

                await project['preprocessStagingFiles']();
                const result = fsExtra.readFileSync(stagingPath, 'utf8');
                expect(result).to.equal(`line1\n'//# sourceMappingURL=first.brs.map\nline2\n'//# sourceMappingURL=main.brs.map`);
            });

            // ── colocated map (no comment) ────────────────────────────────────────────
            it('does not modify the file when there is no comment but a colocated .map exists — copies the map next to the staging file instead', async () => {
                const originalContent = `sub main()\nend sub`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;

                const result = await stageFileWithColocatedMap('.brs');

                expect(result).to.equal(originalContent);
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been copied next to the staging file').to.be.true;
            });

            it('copies the colocated map next to the staging file for xml files', async () => {
                const originalContent = `sub main()\nend sub`;
                const stagingXmlPath = s`${stagingDir}/source/main.xml`;
                const stagingMapPath = s`${stagingDir}/source/main.xml.map`;

                const result = await stageFileWithColocatedMap('.xml');

                expect(result).to.equal(originalContent);
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been copied next to the staging file').to.be.true;
            });

            it('copies the colocated map next to the staging file for other file types', async () => {
                const originalContent = `sub main()\nend sub`;
                const stagingMapPath = s`${stagingDir}/source/main.md.map`;

                const result = await stageFileWithColocatedMap('.md');

                expect(result).to.equal(originalContent);
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been copied next to the staging file').to.be.true;
            });

            it('does not modify the file when the colocated .map was already staged right next to the source file', async () => {
                const original = `sub main()\nend sub`;
                const result = await stageFileWithColocatedMap('.brs', { stageMap: true });
                expect(result).to.equal(original);
            });

            it('does not modify the file when the colocated .map was staged at a different location — colocates the map next to the staging file', async () => {
                const originalContent = `sub main()\nend sub`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;
                const mapStagedElsewhere = s`${stagingDir}/maps/main.brs.map`;

                const result = await stageFileWithColocatedMap('.brs', { stageMap: true, stagingMapDest: mapStagedElsewhere });

                expect(result).to.equal(originalContent);
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been copied next to the staging file').to.be.true;
            });

            // ── no comment, no colocated map ──────────────────────────────────────────
            it('leaves the file untouched when there is no comment and no colocated map', async () => {
                const originalBrsPath = s`${tempPath}/src/source/main.brs`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;

                fsExtra.ensureDirSync(path.dirname(originalBrsPath));
                fsExtra.ensureDirSync(path.dirname(stagingBrsPath));

                const originalContents = `sub main()\nend sub\n`;
                fsExtra.writeFileSync(originalBrsPath, originalContents);
                fsExtra.copySync(originalBrsPath, stagingBrsPath);
                project.fileMappings = [{ src: originalBrsPath, dest: stagingBrsPath }];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(originalContents);
            });

            // ── binary files ──────────────────────────────────────────────────────────
            it('skips binary files without modifying them', async () => {
                for (const ext of Project.binaryExtensions) {
                    const originalPath = s`${tempPath}/src/source/file${ext}`;
                    const stagingPath = s`${stagingDir}/source/file${ext}`;

                    fsExtra.ensureDirSync(path.dirname(originalPath));
                    fsExtra.ensureDirSync(path.dirname(stagingPath));

                    const binaryContents = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
                    fsExtra.writeFileSync(originalPath, binaryContents);
                    fsExtra.copySync(originalPath, stagingPath);

                    project.fileMappings = [{ src: originalPath, dest: stagingPath }];
                    await project['preprocessStagingFiles']();

                    expect(Buffer.compare(fsExtra.readFileSync(stagingPath), binaryContents)).to.equal(0, `${ext} file should be untouched`);
                }
            });

            // ── legacy and variant comment forms ──────────────────────────────────────
            describe('legacy and variant comment forms', () => {
                // brs variants
                it('brs: rewrites legacy @ form', async () => {
                    expect(await stageFileWithComment('.brs', `'//@ sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });
                it(`brs: rewrites when // is omitted  ('# sourceMappingURL=...)`, async () => {
                    expect(await stageFileWithComment('.brs', `'# sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });
                it(`brs: rewrites when // is omitted with legacy @  ('@ sourceMappingURL=...)`, async () => {
                    expect(await stageFileWithComment('.brs', `'@ sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });
                it(`brs: rewrites with whitespace between ' and //# ('  //# sourceMappingURL=...)`, async () => {
                    expect(await stageFileWithComment('.brs', `'  //# sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });
                it(`brs: rewrites with whitespace and no // ('  # sourceMappingURL=...)`, async () => {
                    expect(await stageFileWithComment('.brs', `'  # sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });
                it('brs: no space between # and sourceMappingURL', async () => {
                    expect(await stageFileWithComment('.brs', `'//#sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });
                it('brs: no space between @ and sourceMappingURL (legacy)', async () => {
                    expect(await stageFileWithComment('.brs', `'//@sourceMappingURL=../maps/main.brs.map`)).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                // xml variants
                it('xml: rewrites legacy @ form  (<!--//@ sourceMappingURL=... -->)', async () => {
                    expect(await stageFileWithComment('.xml', `<!--//@ sourceMappingURL=../maps/main.xml.map -->`)).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });
                it('xml: rewrites when // is omitted  (<!--# sourceMappingURL=... -->)', async () => {
                    expect(await stageFileWithComment('.xml', `<!--# sourceMappingURL=../maps/main.xml.map -->`)).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });
                it('xml: rewrites with whitespace between <!-- and //# (<!--  //# sourceMappingURL=... -->)', async () => {
                    expect(await stageFileWithComment('.xml', `<!--  //# sourceMappingURL=../maps/main.xml.map -->`)).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });
                it('xml: rewrites with whitespace and no // (<!--  # sourceMappingURL=... -->)', async () => {
                    expect(await stageFileWithComment('.xml', `<!--  # sourceMappingURL=../maps/main.xml.map -->`)).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });
                it('xml: no space between # and sourceMappingURL', async () => {
                    expect(await stageFileWithComment('.xml', `<!--//#sourceMappingURL=../maps/main.xml.map -->`)).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });

                // other (markdown) variants
                it('other: rewrites legacy @ form  (//@ sourceMappingURL=...)', async () => {
                    expect(await stageFileWithComment('.md', `//@ sourceMappingURL=../maps/main.md.map`)).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });
                it('other: rewrites with whitespace between // and # (//  # sourceMappingURL=...)', async () => {
                    expect(await stageFileWithComment('.md', `//  # sourceMappingURL=../maps/main.md.map`)).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });
                it('other: rewrites with whitespace between // and @ (//  @ sourceMappingURL=...)', async () => {
                    expect(await stageFileWithComment('.md', `//  @ sourceMappingURL=../maps/main.md.map`)).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });
                it('other: no space between # and sourceMappingURL', async () => {
                    expect(await stageFileWithComment('.md', `//#sourceMappingURL=../maps/main.md.map`)).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });
            });

            // ── map file lifecycle ────────────────────────────────────────────────────
            it('deletes the original map from its source location when a comment references it', async () => {
                const originalMapDir = s`${tempPath}/src/components/maps`;
                const originalMapPath = s`${originalMapDir}/main.brs.map`;

                await stageFileWithComment('.brs', `'//# sourceMappingURL=../maps/main.brs.map`, {
                    originalMapDir: originalMapDir
                });

                expect(fsExtra.pathExistsSync(originalMapPath), 'original map should have been deleted by colocateSourceMap').to.be.false;
            });

            it('deletes the original map from its source location when the map is colocated next to the original source', async () => {
                const srcDir = s`${tempPath}/rootDir/source`;
                const originalMapPath = s`${srcDir}/main.brs.map`;

                await stageFileWithColocatedMap('.brs');

                expect(fsExtra.pathExistsSync(originalMapPath), 'original colocated map should have been deleted by colocateSourceMap').to.be.false;
            });

            it('copies the map file to staging and it is valid JSON', async () => {
                const mapContent = { version: 3, sources: ['main.brs'], mappings: 'AAAA' };
                const srcDir = s`${tempPath}/rootDir/source`;
                const originalPath = s`${srcDir}/main.brs`;
                const originalMapPath = s`${srcDir}/main.brs.map`;
                const stagingPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;

                fsExtra.ensureDirSync(srcDir);
                fsExtra.ensureDirSync(path.dirname(stagingPath));
                fsExtra.writeFileSync(originalPath, `sub main()\nend sub`);
                fsExtra.writeJsonSync(originalMapPath, mapContent);
                fsExtra.copySync(originalPath, stagingPath);
                project.fileMappings = [{ src: originalPath, dest: stagingPath }];

                await project['preprocessStagingFiles']();

                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been copied to staging').to.be.true;
                const copiedMap = fsExtra.readJsonSync(stagingMapPath);
                // version is preserved; sources are rewritten by fixSourceMapSources (which is expected)
                expect(copiedMap.version).to.equal(mapContent.version);
                expect(copiedMap.mappings).to.equal(mapContent.mappings);
            });

            it('rewrites the comment and copies the map even when the map was not listed in fileMappings', async () => {
                // The map exists on disk but was not staged through fileMappings — colocateSourceMap
                // should still copy it next to the staging file and the comment should point at it.
                const originalDir = s`${tempPath}/src/source`;
                const originalMapDir = s`${tempPath}/src/source`;
                const originalPath = s`${originalDir}/main.brs`;
                const originalMapPath = s`${originalMapDir}/main.brs.map`;
                const stagingPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;

                fsExtra.ensureDirSync(originalDir);
                fsExtra.ensureDirSync(path.dirname(stagingPath));
                fsExtra.writeFileSync(originalPath, `content\n'//# sourceMappingURL=main.brs.map`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });
                fsExtra.copySync(originalPath, stagingPath);
                // Only stage the source file, not the map
                project.fileMappings = [{ src: originalPath, dest: stagingPath }];

                await project['preprocessStagingFiles']();

                const result = fsExtra.readFileSync(stagingPath, 'utf8');
                expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                expect(fsExtra.pathExistsSync(stagingMapPath), 'map should have been copied next to the staging file').to.be.true;
            });
        });
    });

    describe('updateManifestBsConsts', () => {
        let constsLine: string;
        let startingFileContents: string;
        let bsConsts: Record<string, boolean>;

        beforeEach(() => {
            constsLine = 'bs_const=const=false;const2=true;const3=false';
            startingFileContents = `title=ComponentLibraryTestChannel
                subtitle=Test Channel for Scene Graph Component Library
                mm_icon_focus_hd=pkg:/images/MainMenu_Icon_Center_HD.png
                mm_icon_side_hd=pkg:/images/MainMenu_Icon_Side_HD.png
                mm_icon_focus_sd=pkg:/images/MainMenu_Icon_Center_SD43.png
                mm_icon_side_sd=pkg:/images/MainMenu_Icon_Side_SD43.png
                splash_screen_fd=pkg:/images/splash_fhd.jpg
                splash_screen_hd=pkg:/images/splash_hd.jpg
                splash_screen_sd=pkg:/images/splash_sd.jpg
                major_version=1
                minor_version=1
                build_version=00001
                ${constsLine}
            `.replace(/ {4}/g, '');

            bsConsts = {};
        });

        it('should update one bs_const in the bs_const line', () => {
            let fileContents: string;
            bsConsts.const = true;
            fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=true;const2=true;const3=false')
            );

            delete bsConsts.const;
            bsConsts.const2 = false;
            fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=false;const2=false;const3=false')
            );

            delete bsConsts.const2;
            bsConsts.const3 = true;
            fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=false;const2=true;const3=true')
            );
        });

        it('should update all bs_consts in the bs_const line', () => {
            bsConsts.const = true;
            bsConsts.const2 = false;
            bsConsts.const3 = true;
            let fileContents = project.updateManifestBsConsts(bsConsts, startingFileContents);
            expect(fileContents).to.equal(
                startingFileContents.replace(constsLine, 'bs_const=const=true;const2=false;const3=true')
            );
        });
        it('should throw error when there is no bs_const line', () => {
            expect(() => {
                project.updateManifestBsConsts(bsConsts, startingFileContents.replace(constsLine, ''));
            }).to.throw;
        });

        it('should throw error if there is consts in the bsConsts that are not in the manifest', () => {
            bsConsts.const4 = true;
            expect(() => {
                project.updateManifestBsConsts(bsConsts, startingFileContents);
            }).to.throw;
        });
    });

    describe('copyAndTransformRaleTrackerTask', () => {
        let raleTrackerTaskFileLocation = s`${cwd}/TrackerTask.xml`;
        before(() => {
            fsExtra.writeFileSync(raleTrackerTaskFileLocation, `<!--dummy contents-->`);
        });
        after(() => {
            fsExtra.removeSync(tempPath);
            fsExtra.removeSync(raleTrackerTaskFileLocation);
        });
        afterEach(() => {
            fsExtra.emptyDirSync(tempPath);
            fsExtra.rmdirSync(tempPath);
        });

        async function doTest(fileContents: string, expectedContents: string, fileExt = 'brs') {
            fsExtra.emptyDirSync(tempPath);
            let folder = s`${tempPath}/findMainFunctionTests/`;
            fsExtra.mkdirSync(folder);

            let filePath = s`${folder}/main.${fileExt}`;

            fsExtra.writeFileSync(filePath, fileContents);
            project.stagingDir = folder;
            project.injectRaleTrackerTask = true;
            //these file contents don't actually matter
            project.raleTrackerTaskFileLocation = raleTrackerTaskFileLocation;
            await project.copyAndTransformRaleTrackerTask();
            let newFileContents = (await fsExtra.readFile(filePath)).toString();
            expect(newFileContents).to.equal(expectedContents);
        }

        it('copies the RALE xml file', async () => {
            fsExtra.ensureDirSync(tempPath);
            fsExtra.writeFileSync(`${tempPath}/RALE.xml`, 'test contents');
            await doTest(`sub main()\nend sub`, `sub main()\nend sub`);
            expect(fsExtra.pathExistsSync(s`${project.stagingDir}/components/TrackerTask.xml`), 'TrackerTask.xml was not copied to staging').to.be.true;
        });

        it('works for inline comments brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', `: ${Project.RALE_TRACKER_TASK_CODE}`);

            await doTest(brsSample.replace('<ENTRY>', `\' ${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${Project.RALE_TRACKER_ENTRY}                 `), expectedBrs);
        });

        it('works for in line comments in xml files', async () => {
            let xmlSample = `<?rokuml version="1.0" encoding="utf-8" ?>
            <!--********** Copyright COMPANY All Rights Reserved. **********-->

            <component name="TrackerTask" extends="Task">
              <interface>
                  <field id="sample" type="string"/>
                  <function name="sampleFunction"/>
              </interface>
                <script type = "text/brightscript" >
                <![CDATA[
                    <ENTRY>
                ]]>
                </script>
            </component>`;
            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true : ${Project.RALE_TRACKER_TASK_CODE}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true ' ${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '        ${Project.RALE_TRACKER_ENTRY}      \n        end sub`), expectedXml, 'xml');
        });

        it('works for stand alone comments in brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show\n  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', Project.RALE_TRACKER_TASK_CODE);

            await doTest(brsSample.replace('<ENTRY>', `\' ${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${Project.RALE_TRACKER_ENTRY}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${Project.RALE_TRACKER_ENTRY}                 `), expectedBrs);
        });

        it('works for stand alone comments in xml files', async () => {
            let xmlSample = `<?rokuml version="1.0" encoding="utf-8" ?>
            <!--********** Copyright COMPANY All Rights Reserved. **********-->

            <component name="TrackerTask" extends="Task">
              <interface>
                  <field id="sample" type="string"/>
                  <function name="sampleFunction"/>
              </interface>
                <script type = "text/brightscript" >
                <![CDATA[
                    <ENTRY>
                ]]>
                </script>
            </component>`;

            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ${Project.RALE_TRACKER_TASK_CODE}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ' ${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '${Project.RALE_TRACKER_ENTRY}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '        ${Project.RALE_TRACKER_ENTRY}      \n        end sub`), expectedXml, 'xml');
        });
    });

    describe('copyAndTransformRDB', () => {
        const sourceFileRelativePath = 'source/sourceFile.brs';
        const componentsFileRelativePath = 'components/componentFile.brs';
        const sourceFilePath = s`${rdbFilesBasePath}/${sourceFileRelativePath}`;
        const componentsFilePath = s`${rdbFilesBasePath}/${componentsFileRelativePath}`;
        before(() => {
            fsExtra.mkdirSync(path.dirname(sourceFilePath), { recursive: true });
            fsExtra.writeFileSync(sourceFilePath, `' ${sourceFilePath}`);
            fsExtra.mkdirSync(path.dirname(componentsFilePath), { recursive: true });
            fsExtra.writeFileSync(componentsFilePath, `' ${componentsFilePath}`);
        });
        after(() => {
            fsExtra.removeSync(tempPath);
            fsExtra.emptyDirSync(rdbFilesBasePath);
            fsExtra.rmdirSync(rdbFilesBasePath);
        });
        afterEach(() => {
            fsExtra.emptyDirSync(tempPath);
            fsExtra.rmdirSync(tempPath);
        });

        async function doTest(fileContents: string, expectedContents: string, fileExt = 'brs', injectRdbOnDeviceComponent = true) {
            fsExtra.emptyDirSync(tempPath);
            let folder = s`${tempPath}/findMainFunctionTests/`;
            fsExtra.mkdirSync(folder);

            let filePath = s`${folder}/main.${fileExt}`;

            fsExtra.writeFileSync(filePath, fileContents);
            project.stagingDir = folder;
            project.injectRdbOnDeviceComponent = injectRdbOnDeviceComponent;
            project.rdbFilesBasePath = rdbFilesBasePath;
            await project.copyAndTransformRDB();
            let newFileContents = (await fsExtra.readFile(filePath)).toString();
            expect(newFileContents).to.equal(expectedContents);
        }

        it('copies the RDB files', async () => {
            fsExtra.ensureDirSync(tempPath);
            await doTest(`sub main()\nend sub`, `sub main()\nend sub`);
            expect(fsExtra.pathExistsSync(s`${project.stagingDir}/${sourceFileRelativePath}`), `${sourceFileRelativePath} was not copied to staging`).to.be.true;
            expect(fsExtra.pathExistsSync(s`${project.stagingDir}/${componentsFileRelativePath}`), `${componentsFileRelativePath} was not copied to staging`).to.be.true;
        });

        it('works for inline comments brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', `: ${Project.RDB_ODC_NODE_CODE}`);

            await doTest(brsSample.replace('<ENTRY>', `\' ${Project.RDB_ODC_ENTRY}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${Project.RDB_ODC_ENTRY}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${Project.RDB_ODC_ENTRY}                 `), expectedBrs);
        });

        // it('does not copy files or inject code if turned off', async () => {
        //     fsExtra.ensureDirSync(tempPath);

        //     let brsSample = `\nsub main()\n  screen.show\n  ' ${Project.RDB_ODC_ENTRY}\nend sub`;
        //     project.injectRdbOnDeviceComponent = false
        //     await doTest(brsSample, brsSample, 'brs', false);
        //     expect(fsExtra.pathExistsSync(s`${project.stagingDir}/${sourceFileRelativePath}`), `${sourceFileRelativePath} should not have been copied to staging`).to.be.false;
        //     expect(fsExtra.pathExistsSync(s`${project.stagingDir}/${componentsFileRelativePath}`), `${componentsFileRelativePath} should not have been copied to staging`).to.be.false;
        // });

        it('works for in line comments in xml files', async () => {
            let xmlSample = `<?rokuml version="1.0" encoding="utf-8" ?>
            <!--********** Copyright COMPANY All Rights Reserved. **********-->

            <component name="TrackerTask" extends="Task">
              <interface>
                  <field id="sample" type="string"/>
                  <function name="sampleFunction"/>
              </interface>
                <script type = "text/brightscript" >
                <![CDATA[
                    <ENTRY>
                ]]>
                </script>
            </component>`;
            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true : ${Project.RDB_ODC_NODE_CODE}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true ' ${Project.RDB_ODC_ENTRY}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '${Project.RDB_ODC_ENTRY}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true '        ${Project.RDB_ODC_ENTRY}      \n        end sub`), expectedXml, 'xml');
        });

        it('works for stand alone comments in brs files', async () => {
            let brsSample = `\nsub main()\n  screen.show\n  <ENTRY>\nend sub`;
            let expectedBrs = brsSample.replace('<ENTRY>', Project.RDB_ODC_NODE_CODE);

            await doTest(brsSample.replace('<ENTRY>', `\' ${Project.RDB_ODC_ENTRY}`), expectedBrs);
            await doTest(brsSample.replace('<ENTRY>', `\'${Project.RDB_ODC_ENTRY}`), expectedBrs);
            //works with extra spacing
            await doTest(brsSample.replace('<ENTRY>', `\'         ${Project.RDB_ODC_ENTRY}                 `), expectedBrs);
        });

        it('works for stand alone comments in xml files', async () => {
            let xmlSample = `<?rokuml version="1.0" encoding="utf-8" ?>
            <!--********** Copyright COMPANY All Rights Reserved. **********-->

            <component name="TrackerTask" extends="Task">
              <interface>
                  <field id="sample" type="string"/>
                  <function name="sampleFunction"/>
              </interface>
                <script type = "text/brightscript" >
                <![CDATA[
                    <ENTRY>
                ]]>
                </script>
            </component>`;

            let expectedXml = xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ${Project.RDB_ODC_NODE_CODE}\n        end sub`);

            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             ' ${Project.RDB_ODC_ENTRY}\n        end sub`), expectedXml, 'xml');
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '${Project.RDB_ODC_ENTRY}\n        end sub`), expectedXml, 'xml');
            //works with extra spacing
            await doTest(xmlSample.replace('<ENTRY>', `sub init()\n            m.something = true\n             '        ${Project.RDB_ODC_ENTRY}      \n        end sub`), expectedXml, 'xml');
        });
    });


    describe('zipPackage', () => {
        it('excludes sourcemaps', async () => {
            fsExtra.outputFileSync(`${project.stagingDir}/manifest`, '#stuff');
            fsExtra.outputFileSync(`${project.stagingDir}/source/main.brs`, 'sub main() : end sub');
            fsExtra.outputFileSync(`${project.stagingDir}/source/main.brs.map`, '{}');
            await project.zipPackage({ retainStagingFolder: true });
            const zipPath = path.join(
                project.outDir,
                fsExtra.readdirSync(project.outDir).find(x => x?.toLowerCase().endsWith('.zip'))
            );

            await decompress(zipPath, `${tempPath}/extracted`);
            expect(fsExtra.pathExistsSync(`${tempPath}/extracted/manifest`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${tempPath}/extracted/source/main.brs`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${tempPath}/extracted/source/main.brs.map`)).to.be.false;
        });

        it('uses "packagePath" when specified', async () => {
            fsExtra.outputFileSync(`${project.stagingDir}/manifest`, '#stuff');
            fsExtra.outputFileSync(`${project.stagingDir}/source/main.brs`, 'sub main() : end sub');
            project.packagePath = s`${tempPath}/package/path.zip`;
            await project.zipPackage({ retainStagingFolder: true });

            await decompress(project.packagePath, `${tempPath}/extracted`);
            expect(fsExtra.pathExistsSync(`${tempPath}/extracted/manifest`)).to.be.true;
            expect(fsExtra.pathExistsSync(`${tempPath}/extracted/source/main.brs`)).to.be.true;
        });
    });

});

describe('ComponentLibraryProject', () => {
    let params: ComponentLibraryConstructorParams;
    beforeEach(() => {
        params = {
            rootDir: rootDir,
            outDir: `${outDir}/component-libraries`,
            files: ['a'],
            bsConst: { b: true },
            injectRaleTrackerTask: true,
            sourceDirs: [s`${tempPath}/source1`],
            stagingDir: s`${outDir}/complib1-staging`,
            raleTrackerTaskFileLocation: 'z',
            libraryIndex: 0,
            outFile: 'PrettyComponent.zip',
            enhanceREPLCompletions: false
        };
    });

    describe('computeOutFileName', () => {
        it('properly computes the outFile name', () => {
            let project = new ComponentLibraryProject(params);
            expect(project.outFile).to.equal('PrettyComponent.zip');
            (project as any).computeOutFileName();
            expect(project.outFile).to.equal('PrettyComponent.zip');
        });
    });

    describe('addPostFixToPath', () => {
        it('adds postfix if path is 1) pkg:/ or 2) relative - no spaces in url', async () => {
            let project = new ComponentLibraryProject(params);
            project.fileMappings = [];
            fsExtra.outputFileSync(`${params.stagingDir}/source/main.brs`, '');
            fsExtra.outputFileSync(`${params.stagingDir}/components/Component1.xml`, `
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri="common:/LibCore/v30/bslCore.brs"/>
                    <script type="text/brightscript" uri="CustomComponent.brs"/>
                    <script type="text/brightscript" uri="pkg:/source/utils.brs"/>
                    <script type="text/brightscript" uri="libpkg:/components/component.brs"/>
                </component>
            `);
            await project.postfixFiles();
            expect(
                fsExtra.readFileSync(`${params.stagingDir}/components/Component1.xml`).toString()
            ).to.eql(`
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri="common:/LibCore/v30/bslCore.brs"/>
                    <script type="text/brightscript" uri="CustomComponent__lib0.brs"/>
                    <script type="text/brightscript" uri="pkg:/source/utils__lib0.brs"/>
                    <script type="text/brightscript" uri="libpkg:/components/component__lib0.brs"/>
                </component>
            `);
        });

        it('adds postfix if path is 1) pkg:/ or 2) relative - plus spaces in url', async () => {
            let project = new ComponentLibraryProject(params);
            project.fileMappings = [];
            fsExtra.outputFileSync(`${params.stagingDir}/source/main.brs`, '');
            fsExtra.outputFileSync(`${params.stagingDir}/components/Component1.xml`, `
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri = "common:/LibCore/v30/bslCore.brs"/>
                    <script type="text/brightscript" uri = "CustomComponent.brs"/>
                    <script type="text/brightscript" uri = "pkg:/source/utils.brs"/>
                    <script type="text/brightscript" uri = "libpkg:/components/component.brs"/>
                </component>
            `);
            await project.postfixFiles();
            expect(
                fsExtra.readFileSync(`${params.stagingDir}/components/Component1.xml`).toString()
            ).to.eql(`
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri = "common:/LibCore/v30/bslCore.brs"/>
                    <script type="text/brightscript" uri = "CustomComponent__lib0.brs"/>
                    <script type="text/brightscript" uri = "pkg:/source/utils__lib0.brs"/>
                    <script type="text/brightscript" uri = "libpkg:/components/component__lib0.brs"/>
                </component>
            `);
        });
    });

    describe('stage', () => {
        it('computes stagingDir before calling getFileMappings', async () => {
            delete params.stagingDir;
            let project = new ComponentLibraryProject(params);
            // The default stagingDir is resolved at construction time by roku-deploy
            let defaultStagingDir = project.stagingDir;

            sinon.stub(rokuDeploy, 'getFilePaths').returns(Promise.resolve([
                { src: s`${rootDir}/manifest`, dest: s`${defaultStagingDir}/manifest` },
                { src: s`${rootDir}/source/main.brs`, dest: s`${defaultStagingDir}/source/main.brs` }
            ]));
            sinon.stub(Project.prototype, 'stage').returns(Promise.resolve());
            sinon.stub(util, 'convertManifestToObject').returns(Promise.resolve({}));

            await project.stage();
            expect(project.fileMappings[0]).to.eql({
                src: s`${rootDir}/manifest`,
                dest: s`${outDir}/component-libraries/PrettyComponent/manifest`
            });
            expect(project.fileMappings[1]).to.eql({
                src: s`${rootDir}/source/main.brs`,
                dest: s`${outDir}/component-libraries/PrettyComponent/source/main.brs`
            });
        });

        describe('stage() manifest handling', () => {
            async function testManifestRead(src: string) {
                fsExtra.outputFileSync(`${rootDir}/${src}`, `title=CompLibTest`);
                params.bsConst = undefined;
                const project = new ComponentLibraryProject({
                    rootDir: rootDir,
                    outDir: `${outDir}/component-libraries`,
                    files: [
                        { src: src, dest: 'manifest' }
                    ],
                    stagingDir: s`${outDir}/complib1-staging`,
                    libraryIndex: 0,
                    // eslint-disable-next-line no-template-curly-in-string
                    outFile: '${title}.zip',
                    enhanceREPLCompletions: false
                });
                await project.stage();
                expect(project.outFile).to.eql('CompLibTest.zip');
            }

            it('handles src entries with exactly the name "manifest"', async () => {
                await testManifestRead('manifest');
                await testManifestRead('configs/manifest');
            });

            it('handles non-standard manifest file names', async () => {
                await testManifestRead('manifest.test');
                await testManifestRead('test.manifest');
                await testManifestRead('not_even_close');
            });
        });

        it('uses sg_component_libs_provided from manifest when present', async () => {
            fsExtra.outputFileSync(`${rootDir}/manifest`, `title=TestLib\nsg_component_libs_provided=MyLibrary`);
            params.bsConst = undefined;
            const project = new ComponentLibraryProject({
                rootDir: rootDir,
                outDir: `${outDir}/component-libraries`,
                files: [
                    { src: 'manifest', dest: 'manifest' }
                ],
                stagingDir: s`${outDir}/complib1-staging`,
                libraryIndex: 0,
                outFile: 'test.zip',
                enhanceREPLCompletions: false
            });
            await project.stage();
            expect(project.name).to.equal('MyLibrary');
        });

        it('uses bs_libs_provided from manifest when sg_component_libs_provided is not present', async () => {
            fsExtra.outputFileSync(`${rootDir}/manifest`, `title=TestLib\nbs_libs_provided=MyBSLibrary`);
            params.bsConst = undefined;
            const project = new ComponentLibraryProject({
                rootDir: rootDir,
                outDir: `${outDir}/component-libraries`,
                files: [
                    { src: 'manifest', dest: 'manifest' }
                ],
                stagingDir: s`${outDir}/complib1-staging`,
                libraryIndex: 0,
                outFile: 'test.zip',
                enhanceREPLCompletions: false
            });
            await project.stage();
            expect(project.name).to.equal('MyBSLibrary');
        });

        it('prioritizes sg_component_libs_provided over bs_libs_provided when both are present', async () => {
            fsExtra.outputFileSync(`${rootDir}/manifest`, `title=TestLib\nsg_component_libs_provided=SGLibrary\nbs_libs_provided=BSLibrary`);
            params.bsConst = undefined;
            const project = new ComponentLibraryProject({
                rootDir: rootDir,
                outDir: `${outDir}/component-libraries`,
                files: [
                    { src: 'manifest', dest: 'manifest' }
                ],
                stagingDir: s`${outDir}/complib1-staging`,
                libraryIndex: 0,
                outFile: 'test.zip',
                enhanceREPLCompletions: false
            });
            await project.stage();
            expect(project.name).to.equal('SGLibrary');
        });
    });
});
