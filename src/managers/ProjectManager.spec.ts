import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { util } from '../util';
import { rokuDeploy } from 'roku-deploy';
import * as sinonActual from 'sinon';
import { fileUtils, standardizePath as s } from '../FileUtils';
import type { ComponentLibraryConstructorParams } from './ProjectManager';
import { Project, ComponentLibraryProject, ProjectManager, componentLibraryPostfix } from './ProjectManager';
import { BreakpointManager } from './BreakpointManager';
import { SourceMapManager } from './SourceMapManager';
import { LocationManager } from './LocationManager';
import * as decompress from 'decompress';
import { undent } from 'undent';

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

    describe('loadRequiredLibraryNames', () => {
        /**
         * Write the given `manifestContents` to the project's staged manifest, run the loader, and return
         * the parsed `requiredLibraryNames`.
         */
        async function loadFrom(manifestContents: string) {
            project.stagingDir = stagingDir;
            fsExtra.outputFileSync(s`${stagingDir}/manifest`, manifestContents);
            await project['loadRequiredLibraryNames']();
            return project.requiredLibraryNames;
        }

        it('parses a comma-delimited bs_libs_required list, trimming whitespace', async () => {
            expect(await loadFrom(`bs_libs_required=LibAlpha, LibBeta ,LibCharlie`)).to.eql(['LibAlpha', 'LibBeta', 'LibCharlie']);
        });

        it('returns an empty array when bs_libs_required is absent', async () => {
            expect(await loadFrom(`title=NoLibsHere`)).to.eql([]);
        });

        it('returns an empty array when the manifest does not exist', async () => {
            project.stagingDir = s`${tempPath}/does-not-exist`;
            await project['loadRequiredLibraryNames']();
            expect(project.requiredLibraryNames).to.eql([]);
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

        it('does not crash when the library has no .brs files (only .xml)', async () => {
            let project = new ComponentLibraryProject(params);
            project.fileMappings = [];
            //only an xml file exists in staging - the `**/*.brs` glob will match zero files
            fsExtra.outputFileSync(`${params.stagingDir}/components/Component1.xml`, `
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri="CustomComponent.brs"/>
                </component>
            `);
            //should not throw "No files match the pattern"
            await project.postfixFiles();
            //the xml reference should still get postfixed
            expect(
                fsExtra.readFileSync(`${params.stagingDir}/components/Component1.xml`).toString()
            ).to.eql(`
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri="CustomComponent__lib0.brs"/>
                </component>
            `);
        });

        it('does not crash when the library has no .xml files (only .brs)', async () => {
            let project = new ComponentLibraryProject(params);
            project.fileMappings = [];
            //only a brs file exists in staging - the `**/*.xml` glob will match zero files
            fsExtra.outputFileSync(`${params.stagingDir}/source/main.brs`, `sub main()\nend sub`);
            //should not throw "No files match the pattern"
            await project.postfixFiles();
            //the brs file should be untouched (no uri references to rewrite)
            expect(
                fsExtra.readFileSync(`${params.stagingDir}/source/main.brs`).toString()
            ).to.eql(`sub main()\nend sub`);
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

    describe('applyLibraryReferencePostfixes', () => {
        /**
         * A compact description of a single project (the main app or a component library) in a test world.
         */
        interface ProjectSpec {
            /** the library name this project exports via `bs_libs_provided` (omit for the main project) */
            provides?: string;
            /** the library names this project imports via `bs_libs_required` (comma-delimited in the real manifest) */
            requires?: string[];
            /** the staged files this project ships, by relative path (e.g. `libsource/Alpha.brs`, `components/Widget.brs`).
             *  Only files under `libsource` count as library exports - that's what production decides from the path. */
            files?: string[];
            /** the `.brs` source files this project contains, keyed by relative path (these hold the `Library` statements) */
            source?: Record<string, string>;
        }

        /**
         * Build a world of projects from `specs` (the FIRST spec is the main project, the rest are component
         * libraries), wire up each library's name/required-names/exported-files/postfix, run the manager's
         * library-reference fixer, then return every project's rewritten source keyed by `name/relativePath`.
         *
         * This lets each test read as "given these libraries and these Library statements, here's what they become"
         * without any per-test staging/manifest boilerplate.
         */
        async function doTest(specs: Record<string, ProjectSpec>) {
            let sourceMapManager = new SourceMapManager();
            let locationManager = new LocationManager(sourceMapManager);
            let breakpointManager = new BreakpointManager(sourceMapManager, locationManager);
            let manager = new ProjectManager({ locationManager: locationManager, breakpointManager: breakpointManager });

            const names = Object.keys(specs);
            const projectsByName: Record<string, any> = {};

            names.forEach((name, index) => {
                const spec = specs[name];
                const projectStagingDir = s`${tempPath}/${name}-staging`;

                const postfix = index === 0 ? '' : `${componentLibraryPostfix}${index - 1}`;
                //fileMappings hold each staged file at its real (pre-postfix) relative path - postfixFiles renames
                //files on disk but does not mutate fileMapping.dest, and production decides which files are library
                //exports by whether the path is under `libsource`. The postfix comes from the project's `postfix` getter.
                const fileMappings = (spec.files ?? []).map(relativePath => ({
                    src: s`${tempPath}/${name}-root/${relativePath}`,
                    dest: s`${projectStagingDir}/${relativePath}`
                }));

                //write this project's brs source files (the ones containing `Library` statements)
                for (const [relativePath, contents] of Object.entries(spec.source ?? {})) {
                    fsExtra.outputFileSync(s`${projectStagingDir}/${relativePath}`, contents);
                }

                const project: any = {
                    name: spec.provides,
                    requiredLibraryNames: spec.requires ?? [],
                    fileMappings: fileMappings,
                    stagingDir: projectStagingDir,
                    postfix: postfix,
                    //use the real implementation so the helper exercises production logic instead of reimplementing it
                    getExportedLibraryFileNames: ComponentLibraryProject.prototype.getExportedLibraryFileNames
                };
                projectsByName[name] = { project, spec, stagingDir: projectStagingDir };

                if (index === 0) {
                    manager.mainProject = project;
                } else {
                    manager.componentLibraryProjects.push(project);
                }
            });

            await manager.applyLibraryReferencePostfixes();

            //read back every project's source so tests can assert the rewritten `Library` statements
            const result: Record<string, string> = {};
            for (const name of names) {
                const { spec, stagingDir } = projectsByName[name];
                for (const relativePath of Object.keys(spec.source ?? {})) {
                    result[`${name}/${relativePath}`] = fsExtra.readFileSync(s`${stagingDir}/${relativePath}`).toString();
                }
            }
            return result;
        }

        it('rewrites a Library statement for a file exported by a required library', async () => {
            const result = await doTest({
                main: { requires: ['LibOne'], source: { 'source/main.brs': `Library "Alpha.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] }
            });
            expect(result['main/source/main.brs']).to.equal(`Library "Alpha__lib0.brs"`);
        });

        it('does NOT rewrite a Library statement when the consumer does not require any library', async () => {
            const result = await doTest({
                main: { source: { 'source/main.brs': `Library "Alpha.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] }
            });
            //Alpha is exported by lib1, but main never declared `bs_libs_required=LibOne`, so leave it alone
            expect(result['main/source/main.brs']).to.equal(`Library "Alpha.brs"`);
        });

        it('does NOT rewrite when the required library does not export the referenced file', async () => {
            const result = await doTest({
                main: { requires: ['LibOne'], source: { 'source/main.brs': `Library "Missing.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] }
            });
            expect(result['main/source/main.brs']).to.equal(`Library "Missing.brs"`);
        });

        it('does NOT rewrite a reference to a library .brs file that lives OUTSIDE libsource', async () => {
            const result = await doTest({
                main: { requires: ['LibOne'], source: { 'source/main.brs': `Library "Widget.brs"` } },
                //Widget.brs is staged by lib1 but lives in components/, not libsource/, so it is not a library export
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs', 'components/Widget.brs'] }
            });
            expect(result['main/source/main.brs']).to.equal(`Library "Widget.brs"`);
        });

        it('silently skips a required library name that no loaded library provides', async () => {
            const result = await doTest({
                main: { requires: ['DoesNotExist'], source: { 'source/main.brs': `Library "Alpha.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] }
            });
            expect(result['main/source/main.brs']).to.equal(`Library "Alpha.brs"`);
        });

        it('resolves an overlapping file name to the REQUIRED library, not another library that also exports it', async () => {
            const result = await doTest({
                main: { source: {} },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs', 'libsource/Beta.brs', 'libsource/Charlie.brs'] },
                lib2: { provides: 'LibTwo', files: ['libsource/Alpha.brs', 'libsource/Beta.brs', 'libsource/Delta.brs'] },
                //lib3 requires ONLY lib1, and references Alpha (in both libs), Charlie (lib1 only), and Delta (lib2 only)
                lib3: {
                    provides: 'LibThree', requires: ['LibOne'], source: {
                        'source/lib3.brs': undent`
                            Library "Alpha.brs"
                            Library "Charlie.brs"
                            Library "Delta.brs"
                        `
                    }
                }
            });
            //Alpha -> lib1's postfix (NOT lib2's, even though lib2 also exports Alpha) because lib3 only requires LibOne
            //Charlie -> lib1's postfix (unique to lib1)
            //Delta -> UNCHANGED (only lib2 exports it, and lib3 does not require lib2)
            expect(result['lib3/source/lib3.brs']).to.equal(undent`
                Library "Alpha__lib0.brs"
                Library "Charlie__lib0.brs"
                Library "Delta.brs"
            `);
        });

        it('rewrites references in a transitive chain (LibAlpha->LibBeta, LibCharlie->LibAlpha+LibBeta)', async () => {
            const result = await doTest({
                main: { source: {} },
                libAlpha: { provides: 'LibAlpha', requires: ['LibBeta'], files: ['libsource/AlphaUtil.brs'], source: { 'source/alpha.brs': `Library "BetaUtil.brs"` } },
                libBeta: { provides: 'LibBeta', files: ['libsource/BetaUtil.brs'] },
                libCharlie: {
                    provides: 'LibCharlie', requires: ['LibAlpha', 'LibBeta'], source: {
                        'source/charlie.brs': undent`
                            Library "AlphaUtil.brs"
                            Library "BetaUtil.brs"
                        `
                    }
                }
            });
            //libAlpha requires libBeta -> its reference to BetaUtil is postfixed with libBeta's postfix (index 2 -> __lib1)
            expect(result['libAlpha/source/alpha.brs']).to.equal(`Library "BetaUtil__lib1.brs"`);
            //libCharlie requires both -> AlphaUtil gets libAlpha's postfix (__lib0), BetaUtil gets libBeta's (__lib1)
            expect(result['libCharlie/source/charlie.brs']).to.equal(undent`
                Library "AlphaUtil__lib0.brs"
                Library "BetaUtil__lib1.brs"
            `);
        });

        it('rewrites references in the main project the same as in libraries', async () => {
            const result = await doTest({
                main: { requires: ['LibOne'], source: { 'source/main.brs': `Library "Alpha.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] }
            });
            expect(result['main/source/main.brs']).to.equal(`Library "Alpha__lib0.brs"`);
        });

        it('does NOT rewrite a main project reference to a file from a library the main project does not require', async () => {
            const result = await doTest({
                //main requires ONLY lib1, but references files from both lib1 and lib2
                main: {
                    requires: ['LibOne'], source: {
                        'source/main.brs': undent`
                            Library "Alpha.brs"
                            Library "Delta.brs"
                        `
                    }
                },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] },
                lib2: { provides: 'LibTwo', files: ['libsource/Delta.brs'] }
            });
            //Alpha -> lib1's postfix (main requires LibOne); Delta -> UNCHANGED (only lib2 has it, main does not require lib2)
            expect(result['main/source/main.brs']).to.equal(undent`
                Library "Alpha__lib0.brs"
                Library "Delta.brs"
            `);
        });

        it('resolves an overlapping file name in the main project to the REQUIRED library', async () => {
            const result = await doTest({
                //main requires ONLY lib2; both libs export Alpha, so Alpha must resolve to lib2's postfix (not lib1's)
                main: { requires: ['LibTwo'], source: { 'source/main.brs': `Library "Alpha.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] },
                lib2: { provides: 'LibTwo', files: ['libsource/Alpha.brs'] }
            });
            //lib1 is index 1 (__lib0), lib2 is index 2 (__lib1) -> Alpha resolves to lib2's __lib1
            expect(result['main/source/main.brs']).to.equal(`Library "Alpha__lib1.brs"`);
        });

        it('rewrites a lowercase `library` statement and preserves the keyword casing', async () => {
            //libraries in the wild use a lowercase `library` keyword; only the file name should change
            const result = await doTest({
                main: { requires: ['LibOne'], source: { 'source/main.brs': `library "Alpha.brs"` } },
                lib1: { provides: 'LibOne', files: ['libsource/Alpha.brs'] }
            });
            expect(result['main/source/main.brs']).to.equal(`library "Alpha__lib0.brs"`);
        });

        it('handles a full dependency graph the same way the real sample does (app + 3 libs, mixed keyword casing)', async () => {
            //mirrors the private-samples/code-library project: libs are declared leaf-first so postfix indexes line up,
            //the app requires all 3 and references each, and libs reference their own dependencies with a lowercase keyword
            const result = await doTest({
                //app: requires all three, references one file from each
                app: {
                    requires: ['LibCharlie', 'LibBeta', 'LibAlpha'],
                    source: {
                        'source/main.brs': undent`
                            Library "LibCharlie.brs"
                            Library "LibBeta.brs"
                            Library "LibAlpha.brs"
                        `
                    }
                },
                //LibCharlie: leaf dependency, requires nothing (index 1 -> __lib0)
                LibCharlie: { provides: 'LibCharlie', files: ['libsource/LibCharlie.brs'] },
                //LibBeta: requires LibCharlie (index 2 -> __lib1)
                LibBeta: {
                    provides: 'LibBeta', requires: ['LibCharlie'], files: ['libsource/LibBeta.brs'],
                    source: { 'libsource/LibBeta.brs': `library "LibCharlie.brs"` }
                },
                //LibAlpha: requires LibBeta and LibCharlie (index 3 -> __lib2)
                LibAlpha: {
                    provides: 'LibAlpha', requires: ['LibBeta', 'LibCharlie'], files: ['libsource/LibAlpha.brs'],
                    source: {
                        'libsource/LibAlpha.brs': undent`
                            library "LibBeta.brs"
                            library "LibCharlie.brs"
                        `
                    }
                }
            });
            //the app's references each resolve to the providing library's own index
            expect(result['app/source/main.brs']).to.equal(undent`
                Library "LibCharlie__lib0.brs"
                Library "LibBeta__lib1.brs"
                Library "LibAlpha__lib2.brs"
            `);
            //LibBeta references LibCharlie's file -> LibCharlie's index (__lib0), keyword stays lowercase
            expect(result['LibBeta/libsource/LibBeta.brs']).to.equal(`library "LibCharlie__lib0.brs"`);
            //LibAlpha references both of its dependencies -> each resolves to that dependency's index
            expect(result['LibAlpha/libsource/LibAlpha.brs']).to.equal(undent`
                library "LibBeta__lib1.brs"
                library "LibCharlie__lib0.brs"
            `);
        });
    });
});
