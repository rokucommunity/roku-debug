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
             * Primary scenario: .map is OUTSIDE rootDir so it was never staged.
             *
             * /alpha/beta/charlie/rootDir/source/main.brs  → comment: '../../../../../maps/main.brs.map'
             * /alpha/maps/main.brs.map                     (not copied — outside rootDir)
             *
             * After staging:
             * staging/source/main.brs  → comment must be rewritten to an absolute-equivalent
             *                            relative path from the new staging location back to
             *                            the original (unstaged) map file.
             */
            it('rewrites the comment to point at the original map when the map was not staged', async () => {
                const rootDirSource = s`${tempPath}/alpha/beta/charlie/rootDir/source`;
                const mapsDir = s`${tempPath}/alpha/maps`;
                const stagingSourceDir = s`${stagingDir}/source`;

                fsExtra.ensureDirSync(rootDirSource);
                fsExtra.ensureDirSync(mapsDir);
                fsExtra.ensureDirSync(stagingSourceDir);

                const originalBrsPath = s`${rootDirSource}/main.brs`;
                const originalMapPath = s`${mapsDir}/main.brs.map`;
                const stagingBrsPath = s`${stagingSourceDir}/main.brs`;

                // The comment in the original file points relatively from rootDirSource → mapsDir
                const originalRelative = s`${path.relative(rootDirSource, originalMapPath)}`;
                fsExtra.writeFileSync(originalBrsPath, `sub main()\nend sub\n'//# sourceMappingURL=${originalRelative}`);

                // Only the .brs is staged — the .map is outside rootDir and never copied
                fsExtra.copySync(originalBrsPath, stagingBrsPath);

                project.fileMappings = [
                    { src: originalBrsPath, dest: stagingBrsPath }
                    // map intentionally absent
                ];

                await project['preprocessStagingFiles']();

                const updatedContents = fsExtra.readFileSync(stagingBrsPath, 'utf8');
                // The new comment must resolve back to the same absolute map path
                const commentMatch = /'\/\/# sourceMappingURL=(.+)$/.exec(updatedContents);
                expect(commentMatch, 'sourceMappingURL comment should still be present').to.exist;
                const resolvedMapPath = fileUtils.standardizePath(
                    path.resolve(path.dirname(stagingBrsPath), commentMatch[1])
                );
                expect(resolvedMapPath).to.equal(originalMapPath);
            });

            /**
             * When the map WAS staged (at a different relative location), the comment
             * should point at the staged copy, not the original.
             */
            it('rewrites the comment to point at the staged map when the map was also staged (.brs)', async () => {
                // Source layout:
                //   src/components/views/main.brs  → comment: '../maps/main.brs.map'
                //   src/components/maps/main.brs.map
                // Staging layout (both siblings in source/):
                //   staging/source/main.brs        → comment should become: 'main.brs.map'
                //   staging/source/main.brs.map
                const originalBrsPath = s`${tempPath}/src/components/views/main.brs`;
                const originalMapPath = s`${tempPath}/src/components/maps/main.brs.map`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;
                const stagingMapPath = s`${stagingDir}/source/main.brs.map`;

                fsExtra.ensureDirSync(path.dirname(originalBrsPath));
                fsExtra.ensureDirSync(path.dirname(originalMapPath));
                fsExtra.ensureDirSync(path.dirname(stagingBrsPath));

                fsExtra.writeFileSync(originalBrsPath, `sub main()\nend sub\n'//# sourceMappingURL=../maps/main.brs.map`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });

                fsExtra.copySync(originalBrsPath, stagingBrsPath);
                fsExtra.copySync(originalMapPath, stagingMapPath);

                project.fileMappings = [
                    { src: originalBrsPath, dest: stagingBrsPath },
                    { src: originalMapPath, dest: stagingMapPath }
                ];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(`sub main()\nend sub\n'//# sourceMappingURL=main.brs.map`);
            });

            it('does not rewrite the comment when the relative path is already correct after staging', async () => {
                // .brs and .map are siblings in both source and staging — no change needed
                const srcDir = s`${tempPath}/src/source`;
                const stagingSourceDir = s`${stagingDir}/source`;

                fsExtra.ensureDirSync(srcDir);
                fsExtra.ensureDirSync(stagingSourceDir);

                const originalBrsPath = s`${srcDir}/main.brs`;
                const originalMapPath = s`${srcDir}/main.brs.map`;
                const stagingBrsPath = s`${stagingSourceDir}/main.brs`;
                const stagingMapPath = s`${stagingSourceDir}/main.brs.map`;

                const originalContents = `sub main()\nend sub\n'//# sourceMappingURL=main.brs.map`;
                fsExtra.writeFileSync(originalBrsPath, originalContents);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });

                fsExtra.copySync(originalBrsPath, stagingBrsPath);
                fsExtra.copySync(originalMapPath, stagingMapPath);

                project.fileMappings = [
                    { src: originalBrsPath, dest: stagingBrsPath },
                    { src: originalMapPath, dest: stagingMapPath }
                ];

                await project['preprocessStagingFiles']();

                // File should be unchanged (no write needed)
                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(originalContents);
            });

            it('rewrites the XML format comment (<!--//# sourceMappingURL=... -->)', async () => {
                // Source layout:
                //   src/components/views/MainScene.xml  → comment: '../maps/MainScene.xml.map'
                //   src/components/maps/MainScene.xml.map
                // Staging layout (both siblings in source/):
                //   staging/source/MainScene.xml        → comment should become: 'MainScene.xml.map'
                //   staging/source/MainScene.xml.map
                const originalXmlPath = s`${tempPath}/src/components/views/MainScene.xml`;
                const originalMapPath = s`${tempPath}/src/components/maps/MainScene.xml.map`;
                const stagingXmlPath = s`${stagingDir}/source/MainScene.xml`;
                const stagingMapPath = s`${stagingDir}/source/MainScene.xml.map`;

                fsExtra.ensureDirSync(path.dirname(originalXmlPath));
                fsExtra.ensureDirSync(path.dirname(originalMapPath));
                fsExtra.ensureDirSync(path.dirname(stagingXmlPath));

                fsExtra.writeFileSync(originalXmlPath, `<component name="MainScene">\n</component>\n<!--//# sourceMappingURL=../maps/MainScene.xml.map -->`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });

                fsExtra.copySync(originalXmlPath, stagingXmlPath);
                fsExtra.copySync(originalMapPath, stagingMapPath);

                project.fileMappings = [
                    { src: originalXmlPath, dest: stagingXmlPath },
                    { src: originalMapPath, dest: stagingMapPath }
                ];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingXmlPath, 'utf8')).to.equal(`<component name="MainScene">\n</component>\n<!--//# sourceMappingURL=MainScene.xml.map -->`);
            });

            describe('legacy and variant comment forms', () => {
                // Helper: set up a brs/xml/md file with a given comment, stage it, run preprocessStagingFiles,
                // and return the updated staged file contents.
                async function runWithComment(ext: string, commentLine: string) {
                    const originalPath = s`${tempPath}/src/source/main${ext}`;
                    const stagingPath = s`${stagingDir}/source/main${ext}`;
                    const originalMapPath = s`${tempPath}/src/maps/main${ext}.map`;
                    const stagingMapPath = s`${stagingDir}/source/main${ext}.map`;

                    fsExtra.ensureDirSync(path.dirname(originalPath));
                    fsExtra.ensureDirSync(path.dirname(originalMapPath));
                    fsExtra.ensureDirSync(path.dirname(stagingPath));

                    fsExtra.writeFileSync(originalPath, `content\n${commentLine}`);
                    fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });
                    fsExtra.copySync(originalPath, stagingPath);
                    fsExtra.copySync(originalMapPath, stagingMapPath);

                    project.fileMappings = [
                        { src: originalPath, dest: stagingPath },
                        { src: originalMapPath, dest: stagingMapPath }
                    ];

                    await project['preprocessStagingFiles']();
                    return fsExtra.readFileSync(stagingPath, 'utf8');
                }

                // ── brs variants ──────────────────────────────────────────────────────────
                it('brs: rewrites legacy @ form', async () => {
                    const result = await runWithComment('.brs', `'//@ sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                it('brs: rewrites when // is omitted  (\'# sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.brs', `'# sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                it('brs: rewrites when // is omitted with legacy @  (\'@ sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.brs', `'@ sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                it('brs: rewrites with whitespace between \' and //# (\'  //# sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.brs', `'  //# sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                it('brs: rewrites with whitespace and no // (\'  # sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.brs', `'  # sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                // ── xml variants ──────────────────────────────────────────────────────────
                it('xml: rewrites legacy @ form  (<!--//@ sourceMappingURL=... -->)', async () => {
                    const result = await runWithComment('.xml', `<!--//@ sourceMappingURL=../maps/main.xml.map -->`);
                    expect(result).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });

                it('xml: rewrites when // is omitted  (<!--# sourceMappingURL=... -->)', async () => {
                    const result = await runWithComment('.xml', `<!--# sourceMappingURL=../maps/main.xml.map -->`);
                    expect(result).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });

                it('xml: rewrites with whitespace between <!-- and //# (<!--  //# sourceMappingURL=... -->)', async () => {
                    const result = await runWithComment('.xml', `<!--  //# sourceMappingURL=../maps/main.xml.map -->`);
                    expect(result).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });

                it('xml: rewrites with whitespace and no // (<!--  # sourceMappingURL=... -->)', async () => {
                    const result = await runWithComment('.xml', `<!--  # sourceMappingURL=../maps/main.xml.map -->`);
                    expect(result).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });

                // ── other text-based file variants ─────────────────────────────────────────────
                it('other: rewrites legacy @ form  (//@ sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.md', `//@ sourceMappingURL=../maps/main.md.map`);
                    expect(result).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });

                it('other: rewrites with whitespace between // and # (//  # sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.md', `//  # sourceMappingURL=../maps/main.md.map`);
                    expect(result).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });

                it('other: rewrites with whitespace between // and @ (//  @ sourceMappingURL=...)', async () => {
                    const result = await runWithComment('.md', `//  @ sourceMappingURL=../maps/main.md.map`);
                    expect(result).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });

                // ── no space between #/@ and sourceMappingURL ─────────────────────────
                it('brs: matches when there is no space between # and sourceMappingURL', async () => {
                    const result = await runWithComment('.brs', `'//# sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                it('brs: matches when there is no space between @ and sourceMappingURL (legacy)', async () => {
                    const result = await runWithComment('.brs', `'//@ sourceMappingURL=../maps/main.brs.map`);
                    expect(result).to.equal(`content\n'//# sourceMappingURL=main.brs.map`);
                });

                it('xml: matches when there is no space between # and sourceMappingURL', async () => {
                    const result = await runWithComment('.xml', `<!--//#sourceMappingURL=../maps/main.xml.map -->`);
                    expect(result).to.equal(`content\n<!--//# sourceMappingURL=main.xml.map -->`);
                });

                it('other: matches when there is no space between # and sourceMappingURL', async () => {
                    const result = await runWithComment('.md', `//#sourceMappingURL=../maps/main.md.map`);
                    expect(result).to.equal(`content\n//# sourceMappingURL=main.md.map`);
                });
            });

            it('injects a comment when there is none but a sidecar .map exists next to the original source', async () => {
                // Scenario: user's files array omits map files, so only the .brs is staged.
                // The .map exists next to the original .brs in rootDir but was never copied.
                // We should inject a comment in the staged .brs pointing back at the original map.
                const srcDir = s`${tempPath}/rootDir/source`;
                const stagingSourceDir = s`${stagingDir}/source`;

                fsExtra.ensureDirSync(srcDir);
                fsExtra.ensureDirSync(stagingSourceDir);

                const originalBrsPath = s`${srcDir}/main.brs`;
                const originalMapPath = s`${srcDir}/main.brs.map`;  // sidecar, never staged
                const stagingBrsPath = s`${stagingSourceDir}/main.brs`;

                fsExtra.writeFileSync(originalBrsPath, `sub main()\nend sub`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });

                // Only the .brs is staged — map was excluded from files array
                fsExtra.copySync(originalBrsPath, stagingBrsPath);

                project.fileMappings = [
                    { src: originalBrsPath, dest: stagingBrsPath }
                ];

                await project['preprocessStagingFiles']();

                const updatedContents = fsExtra.readFileSync(stagingBrsPath, 'utf8');
                const commentMatch = /'\/\/# sourceMappingURL=(.+)$/.exec(updatedContents);
                expect(commentMatch, 'sourceMappingURL comment should have been injected').to.exist;
                // The injected path must resolve back to the original (unstaged) map file
                const resolvedMapPath = fileUtils.standardizePath(
                    path.resolve(path.dirname(stagingBrsPath), commentMatch[1])
                );
                expect(resolvedMapPath).to.equal(originalMapPath);
            });

            it('uses CRLF when injecting a comment into a CRLF file', async () => {
                const originalBrsPath = s`${tempPath}/src/source/main.brs`;
                const originalMapPath = s`${tempPath}/src/source/main.brs.map`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;

                fsExtra.ensureDirSync(path.dirname(originalBrsPath));
                fsExtra.ensureDirSync(path.dirname(stagingBrsPath));

                fsExtra.writeFileSync(originalBrsPath, `sub main()\r\nend sub`);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });
                fsExtra.copySync(originalBrsPath, stagingBrsPath);

                project.fileMappings = [{ src: originalBrsPath, dest: stagingBrsPath }];

                await project['preprocessStagingFiles']();

                const updatedContents = fsExtra.readFileSync(stagingBrsPath, 'utf8');
                expect(updatedContents).to.match(/\r\n'\/\/# sourceMappingURL=/);
            });

            it('does not inject a comment when there is none but the sidecar .map was staged alongside the .brs', async () => {
                const srcDir = s`${tempPath}/rootDir/source`;
                const stagingSourceDir = s`${stagingDir}/source`;

                fsExtra.ensureDirSync(srcDir);
                fsExtra.ensureDirSync(stagingSourceDir);

                const originalBrsPath = s`${srcDir}/main.brs`;
                const originalMapPath = s`${srcDir}/main.brs.map`;
                const stagingBrsPath = s`${stagingSourceDir}/main.brs`;
                const stagingMapPath = s`${stagingSourceDir}/main.brs.map`;

                const originalContents = `sub main()\nend sub`;
                fsExtra.writeFileSync(originalBrsPath, originalContents);
                fsExtra.writeJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });

                fsExtra.copySync(originalBrsPath, stagingBrsPath);
                fsExtra.copySync(originalMapPath, stagingMapPath);

                project.fileMappings = [
                    { src: originalBrsPath, dest: stagingBrsPath },
                    { src: originalMapPath, dest: stagingMapPath }
                ];

                await project['preprocessStagingFiles']();

                // No comment should have been injected — the map is already a sibling in staging
                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(originalContents);
            });

            it('rewrites the comment in an arbitrary text-based file format', async () => {
                // Source layout:
                //   src/components/views/main.md  → comment: '../maps/main.md.map'
                //   src/components/maps/main.md.map
                // Staging layout (both siblings in source/):
                //   staging/source/main.md        → comment should become: 'main.md.map'
                //   staging/source/main.md.map
                const originalFilePath = s`${tempPath}/src/components/views/main.md`;
                const originalMapPath = s`${tempPath}/src/components/maps/main.md.map`;
                const stagingFilePath = s`${stagingDir}/source/main.md`;
                const stagingMapPath = s`${stagingDir}/source/main.md.map`;

                fsExtra.outputFileSync(originalFilePath, `# hello\n//# sourceMappingURL=../maps/main.md.map`);
                fsExtra.outputJsonSync(originalMapPath, { version: 3, sources: [], mappings: '' });

                fsExtra.copySync(originalFilePath, stagingFilePath);
                fsExtra.copySync(originalMapPath, stagingMapPath);

                project.fileMappings = [
                    { src: originalFilePath, dest: stagingFilePath },
                    { src: originalMapPath, dest: stagingMapPath }
                ];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingFilePath, 'utf8')).to.equal(`# hello\n//# sourceMappingURL=main.md.map`);
            });

            it('does not rewrite the comment when the path is absolute', async () => {
                const originalBrsPath = s`${tempPath}/src/source/main.brs`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;

                fsExtra.ensureDirSync(path.dirname(originalBrsPath));
                fsExtra.ensureDirSync(path.dirname(stagingBrsPath));

                const absoluteMapPath = s`${tempPath}/src/source/main.brs.map`;
                const originalContents = `sub main()\nend sub\n'//# sourceMappingURL=${absoluteMapPath}`;
                fsExtra.writeFileSync(originalBrsPath, originalContents);
                fsExtra.copySync(originalBrsPath, stagingBrsPath);

                project.fileMappings = [{ src: originalBrsPath, dest: stagingBrsPath }];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(originalContents);
            });

            it('does not crash when .brs has no sourceMappingURL comment', async () => {
                const srcDir = s`${tempPath}/src/source`;
                const stagingSourceDir = s`${stagingDir}/source`;

                fsExtra.ensureDirSync(srcDir);
                fsExtra.ensureDirSync(stagingSourceDir);

                const originalBrsPath = s`${srcDir}/main.brs`;
                const stagingBrsPath = s`${stagingSourceDir}/main.brs`;

                const originalContents = `sub main()\nend sub\n`;
                fsExtra.writeFileSync(originalBrsPath, originalContents);
                fsExtra.copySync(originalBrsPath, stagingBrsPath);

                project.fileMappings = [{ src: originalBrsPath, dest: stagingBrsPath }];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(originalContents);
            });

            it('leaves the file untouched when there is no comment and no sidecar map next to the original source', async () => {
                const originalBrsPath = s`${tempPath}/src/source/main.brs`;
                const stagingBrsPath = s`${stagingDir}/source/main.brs`;

                fsExtra.ensureDirSync(path.dirname(originalBrsPath));
                fsExtra.ensureDirSync(path.dirname(stagingBrsPath));

                const originalContents = `sub main()\nend sub\n`;
                fsExtra.writeFileSync(originalBrsPath, originalContents);
                fsExtra.copySync(originalBrsPath, stagingBrsPath);

                // No .map file exists next to the original source
                project.fileMappings = [{ src: originalBrsPath, dest: stagingBrsPath }];

                await project['preprocessStagingFiles']();

                expect(fsExtra.readFileSync(stagingBrsPath, 'utf8')).to.equal(originalContents);
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

            sinon.stub(rokuDeploy, 'getFilePaths').returns(Promise.resolve([
                { src: s`${rootDir}/manifest`, dest: s`manifest` },
                { src: s`${rootDir}/source/main.brs`, dest: s`source/main.brs` }
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
