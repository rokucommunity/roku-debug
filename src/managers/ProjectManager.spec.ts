import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { util } from '../util';
import { rokuDeploy } from 'roku-deploy';
import * as sinonActual from 'sinon';
import { fileUtils, standardizePath as s } from '../FileUtils';
import type { ComponentLibraryConstructorParams, ChannelStoreComponentLibraryProjectConstructorParams } from './ProjectManager';
import { Project, RemoteComponentLibraryProject, ProjectManager, ChannelStoreComponentLibraryProject } from './ProjectManager';
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

describe('RemoteComponentLibraryProject', () => {
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
            let project = new RemoteComponentLibraryProject(params);
            expect(project.outFile).to.equal('PrettyComponent.zip');
            (project as any).computeOutFileName();
            expect(project.outFile).to.equal('PrettyComponent.zip');
        });
    });

    describe('addPostFixToPath', () => {
        it('adds postfix if path is 1) pkg:/ or 2) relative - no spaces in url', async () => {
            let project = new RemoteComponentLibraryProject(params);
            project.fileMappings = [];
            fsExtra.outputFileSync(`${params.stagingDir}/source/main.brs`, '');
            fsExtra.outputFileSync(`${params.stagingDir}/components/Component1.xml`, `
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri="common:/LibCore/v30/bslCore.brs"/>
                    <script type="text/brightscript" uri="CustomComponent.brs"/>
                    <script type="text/brightscript" uri="pkg:/source/utils.brs"/>
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
                </component>
            `);
        });

        it('adds postfix if path is 1) pkg:/ or 2) relative - plus spaces in url', async () => {
            let project = new RemoteComponentLibraryProject(params);
            project.fileMappings = [];
            fsExtra.outputFileSync(`${params.stagingDir}/source/main.brs`, '');
            fsExtra.outputFileSync(`${params.stagingDir}/components/Component1.xml`, `
                <component name="CustomComponent" extends="Rectangle">
                    <script type="text/brightscript" uri = "common:/LibCore/v30/bslCore.brs"/>
                    <script type="text/brightscript" uri = "CustomComponent.brs"/>
                    <script type="text/brightscript" uri = "pkg:/source/utils.brs"/>
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
                </component>
            `);
        });
    });

    describe('stage', () => {
        it('computes stagingDir before calling getFileMappings', async () => {
            delete params.stagingDir;
            let project = new RemoteComponentLibraryProject(params);

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
                const project = new RemoteComponentLibraryProject({
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
    });
});

describe('ChannelStoreComponentLibraryProject', () =>{
    let params : ChannelStoreComponentLibraryProjectConstructorParams;
    let logStub;
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
            host: "192.168.1.32'",
            password: "aaaa",
            username: "rokudev",
            enhanceREPLCompletions: false
        };
    });

    describe('stage', () => {
        describe('rokuDeploy Stage method', () => {
            async function testManifestRead(src: string) {
                fsExtra.outputFileSync(`${rootDir}/${src}`, `title=CompLibTest`);
                params.bsConst = undefined;
                const project = new ChannelStoreComponentLibraryProject({
                    rootDir: rootDir,
                    outDir: `${outDir}/component-libraries`,
                    files: [
                        { src: src, dest: 'manifest' }
                    ],
                    stagingDir: s`${outDir}/complib1-staging`,
                    libraryIndex: 0,
                    // eslint-disable-next-line no-template-curly-in-string
                    outFile: '${title}.zip',
                    host: params.host,
                    username: params.username,
                    password: params.password,
                    enhanceREPLCompletions: false
                });
                logStub = sinon.stub(util, 'log');
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
            expect(logStub.calledWith('dcl stage')).to.be.true;
        });
    });

    describe('publish', () =>{
        let stubGetOptions;
        let stubPublish;
        let stubLog;
        let publisher;
        describe('rokudev publish method', ()=>{
                publisher = new ChannelStoreComponentLibraryProject({
                    rootDir: rootDir,
                    outDir: `${outDir}/component-libraries`,
                    files: [
                        { src: 'manifest', dest: 'manifest' }
                    ],
                    stagingDir: s`${outDir}/complib1-staging`,
                    libraryIndex: 0,
                    // eslint-disable-next-line no-template-curly-in-string
                    outFile: '${title}.zip',
                    host: params.host,
                    username: params.username,
                    password: params.password,
                    enhanceREPLCompletions: false

                });
                
                stubGetOptions = sinon.stub(rokuDeploy, 'getOptions').returns({
                    username: 'rokudev',
                });
        
                stubPublish = sinon.stub(rokuDeploy, 'publish').resolves();
                stubLog = sinon.stub(util, 'log');

        it('should call getOptions with correct parameters', async function() {
            await publisher.publish();
    
            expect(stubGetOptions.calledOnce).to.be.true;
            expect(stubGetOptions.calledWith({
                username: 'rokudev',
                appType: 'dcl',
            })).to.be.true;
        });
    
        it('should call publish with correct options', async function() {
            await publisher.publish();
    
            expect(stubPublish.calledOnce).to.be.true;
            expect(stubPublish.calledWith({
                username: 'rokudev',
                appType: 'dcl',
            })).to.be.true;
        });
    
        it('should log error if publish fails', async function() {

            const error = new Error('Publish failed');
            stubPublish.rejects(error);
    
            await publisher.publish();
    
            expect(stubLog.calledOnce).to.be.true;
            expect(stubLog.calledWith(`Error during sideloading: ${error.message}`)).to.be.true;
        });
    
        it('should not log error if publish succeeds', async function() {

            await publisher.publish();
    
            expect(stubLog.notCalled).to.be.true;
        });

        })
    })
})
