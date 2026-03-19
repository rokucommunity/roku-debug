import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { SourceMapConsumer, SourceNode } from 'source-map';
import type { AugmentedSourceBreakpoint, BreakpointWorkItem } from './BreakpointManager';
import { BreakpointManager } from './BreakpointManager';
import { fileUtils, standardizePath as s } from '../FileUtils';
import { ComponentLibraryProject, Project, ProjectManager } from './ProjectManager';
let n = fileUtils.standardizePath.bind(fileUtils);
import type { SourceLocation } from '../managers/LocationManager';
import { LocationManager } from '../managers/LocationManager';
import { SourceMapManager } from './SourceMapManager';
import { expectPickEquals, pickArray } from '../testHelpers.spec';
import { createSandbox } from 'sinon';
const sinon = createSandbox();

describe('BreakpointManager', () => {
    let cwd = fileUtils.standardizePath(process.cwd());

    let tmpDir = s`${cwd}/.tmp`;
    let rootDir = s`${tmpDir}/rootDir`;
    let stagingDir = s`${tmpDir}/stagingDir`;
    let distDir = s`${tmpDir}/dist`;
    let srcDir = s`${tmpDir}/src`;
    let outDir = s`${tmpDir}/out`;
    const srcPath = s`${rootDir}/source/main.brs`;
    const complib1RootDir = s`${tmpDir}/complib1/rootDir`;
    const complib1OutDir = s`${tmpDir}/complib1/outDir`;
    const complib2RootDir = s`${tmpDir}/complib2/rootDir`;
    const complib2OutDir = s`${tmpDir}/complib2/outDir`;

    let bpManager: BreakpointManager;
    let locationManager: LocationManager;
    let sourceMapManager: SourceMapManager;
    let projectManager: ProjectManager;

    beforeEach(() => {
        sinon.restore();
        fsExtra.emptyDirSync(tmpDir);
        fsExtra.ensureDirSync(`${rootDir}/source`);
        fsExtra.ensureDirSync(`${stagingDir}/source`);
        fsExtra.ensureDirSync(`${distDir}/source`);
        fsExtra.ensureDirSync(`${srcDir}/source`);
        fsExtra.ensureDirSync(outDir);

        sourceMapManager = new SourceMapManager();
        locationManager = new LocationManager(sourceMapManager);
        bpManager = new BreakpointManager(sourceMapManager, locationManager);
        projectManager = new ProjectManager({
            breakpointManager: bpManager,
            locationManager: locationManager
        });
        projectManager.mainProject = new Project({
            rootDir: rootDir,
            files: [],
            outDir: s`${outDir}/mainProject`,
            enhanceREPLCompletions: false
        });
        projectManager.addComponentLibraryProject(
            new ComponentLibraryProject({
                rootDir: complib1RootDir,
                files: [],
                libraryIndex: 0,
                outDir: complib1OutDir,
                outFile: s`${complib1OutDir}/complib1.zip`,
                enhanceREPLCompletions: false
            })
        );
        projectManager.addComponentLibraryProject(
            new ComponentLibraryProject({
                rootDir: complib2RootDir,
                files: [],
                libraryIndex: 1,
                outDir: complib2OutDir,
                outFile: s`${complib2OutDir}/complib2.zip`,
                enhanceREPLCompletions: false
            })
        );
    });

    afterEach(() => {
        sinon.restore();
        fsExtra.removeSync(tmpDir);
    });

    describe('pending breakpoints', () => {
        it('marks existing breakpoints as pending', () => {
            const breakpoints = bpManager.replaceBreakpoints(srcPath, [
                { line: 1 },
                { line: 2 },
                { line: 3 },
                { line: 4 }
            ]);
            bpManager.setPending(srcPath, breakpoints, false);
            expect(breakpoints.map(x => bpManager.isPending(x.srcHash))).to.eql([false, false, false, false]);

            bpManager.setPending(srcPath, [{ line: 1 }, { line: 3 }], true);

            expect(breakpoints.map(x => bpManager.isPending(x.srcHash))).to.eql([true, false, true, false]);
        });

        it('marks existing breakpoints as not pending', () => {
            const breakpoints = bpManager.replaceBreakpoints(srcPath, [
                { line: 1 },
                { line: 2 },
                { line: 3 },
                { line: 4 }
            ]);
            bpManager.setPending(srcPath, breakpoints, true);
            expect(breakpoints.map(x => bpManager.isPending(x.srcHash))).to.eql([true, true, true, true]);

            bpManager.setPending(srcPath, [{ line: 1 }, { line: 3 }], false);

            expect(breakpoints.map(x => bpManager.isPending(x.srcHash))).to.eql([false, true, false, true]);
        });

        it('ignores not-found breakpoints', () => {
            const breakpoints = bpManager.replaceBreakpoints(srcPath, [
                { line: 1 },
                { line: 2 },
                { line: 3 },
                { line: 4 }
            ]);
            bpManager.setPending(srcPath, breakpoints, true);
            expect(breakpoints.map(x => bpManager.isPending(x.srcHash))).to.eql([true, true, true, true]);

            bpManager.setPending(srcPath, [{ line: 5 }], false);

            expect(breakpoints.map(x => bpManager.isPending(x.srcHash))).to.eql([true, true, true, true]);
        });

        it('remembers a breakpoint pending status through delete and add', () => {
            let breakpoints = bpManager.replaceBreakpoints(srcPath, [
                { line: 1 }
            ]);
            //mark the breakpoint as pending
            bpManager.setPending(srcPath, breakpoints, true);
            expect(bpManager.isPending(srcPath, breakpoints[0])).to.be.true;

            //delete the breakpoint
            bpManager.deleteBreakpoint(srcPath, { line: 1 });

            //mark the breakpoint as pending (even though it's not there anymore)
            bpManager.setPending(srcPath, [{ line: 5 }], true);

            //add the breakpoint again
            breakpoints = bpManager.replaceBreakpoints(srcPath, [
                { line: 1 }
            ]);

            //the breakpoint should be pending even though this is a new instance of the breakpoint
            expect(bpManager.isPending(srcPath, breakpoints[0])).to.be.true;
        });
    });

    describe('sanitizeSourceFilePath', () => {
        it('returns the original string when no key was found', () => {
            expect(bpManager.sanitizeSourceFilePath('a/b/c')).to.equal(s`a/b/c`);
        });
        it('returns the the found key when it already exists', () => {
            bpManager['breakpointsByFilePath'].set(s`A/B/C`, []);
            expect(bpManager.sanitizeSourceFilePath('a/b/c')).to.equal(s`A/B/C`);
        });
    });

    describe('getSourceAndMapWithBreakpoints', () => {
        it('correctly injects standard breakpoints', () => {
            expect(bpManager.getSourceAndMapWithBreakpoints(`
                    function Main()
                        print "Hello world"
                    end function
                `, 'main.brs', [
                <any>{
                    line: 3
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
            `, 'main.brs', <any>[{
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
            `, 'main.brs',
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
            expect(bpManager.getSourceAndMapWithBreakpoints(`
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
            expect(bpManager.getSourceAndMapWithBreakpoints(`
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
            expect(bpManager.getSourceAndMapWithBreakpoints(`
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
            let result = bpManager.getSourceAndMapWithBreakpoints(`
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

    describe('replaceBreakpoints', () => {
        it('does not verify breakpoints after launch', () => {
            let breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 0,
                column: 0,
                verified: false
            });
        });

        it('re-verifies breakpoint after launch toggle', async () => {
            //set the breakpoint before launch
            let breakpoints = bpManager.replaceBreakpoints(s`${rootDir}/file.brs`, [{
                line: 2
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: false
            });

            //write the breakpoints to the files
            await projectManager['breakpointManager'].writeBreakpointsForProject(projectManager.mainProject);

            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: true
            });

            //simulate user deleting all breakpoints
            breakpoints = bpManager.replaceBreakpoints(s`${rootDir}/file.brs`, []);

            expect(breakpoints).to.be.lengthOf(0);

            //simulate user adding a breakpoint to the same place it had been before
            breakpoints = bpManager.replaceBreakpoints(s`${rootDir}/file.brs`, [{
                line: 2
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: true
            });
        });

        it('retains breakpoint data for breakpoints that did not change', () => {
            //set the breakpoint before launch
            let breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
                line: 2
            }, {
                line: 4,
                condition: 'true'
            }]).map(x => ({ ...x }));

            const replacedBreakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
                line: 2
            }, {
                line: 4,
                condition: 'true'
            }]).map(x => ({ ...x }));

            //the breakpoints should be identical
            expect(breakpoints).to.eql(replacedBreakpoints);
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
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 3
            }]);

            fsExtra.ensureDirSync(`${stagingDir}/source`);
            //copy the file to staging
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //file was copied to staging
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs`)).to.be.true;
            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.false;

            await bpManager.writeBreakpointsForProject(new Project(<any>{
                rootDir: rootDir,
                outDir: outDir,
                stagingDir: stagingDir
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
            bpManager.replaceBreakpoints(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            //sourcemap was not yet created
            expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.false;

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1],
                    stagingDir: stagingDir
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
            bpManager.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingDir: stagingDir
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
            bpManager.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
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

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingDir: stagingDir
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
            bpManager.replaceBreakpoints(n(`${sourceDir1}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);
            bpManager.replaceBreakpoints(n(`${sourceDir2}/source/main.brs`), [{
                line: 3,
                column: 0
            }]);

            await bpManager.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: s`${cwd}/out`,
                    sourceDirs: [sourceDir1, sourceDir2],
                    stagingDir: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });

        describe('unsupported file type filtering', () => {

            it('allows breakpoints in .brs files (no transpiling)', async () => {
                // Scenario: no transpiling, breakpoint in source/main.brs → stagingDir/source/main.brs
                fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\nend sub`);
                fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

                bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint should be written (STOP injected)
                expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.contain('STOP');
                // Breakpoint should be verified
                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/main.brs`)[0];
                expect(bp.verified).to.be.true;
            });

            it('allows breakpoints in .xml files', async () => {
                fsExtra.writeFileSync(`${rootDir}/source/comp.xml`, `<component>\n  <script/>\n</component>`);
                fsExtra.copyFileSync(`${rootDir}/source/comp.xml`, `${stagingDir}/source/comp.xml`);

                bpManager.replaceBreakpoints(s`${rootDir}/source/comp.xml`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint should be written
                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/comp.xml`)[0];
                expect(bp.verified).to.be.true;
            });

            it('allows breakpoints when .bs transpiles to .brs in staging', async () => {
                // Scenario: BrighterScript transpiling. Breakpoint set in src/source/main.bs,
                // transpiles to dist/source/main.brs, copied to stagingDir/source/main.brs.
                // The staging file is .brs so the breakpoint should be accepted.
                fsExtra.writeFileSync(`${sourceDir1}/source/main.bs`, `sub main()\n    print 1\nend sub`);
                // The transpiled output lands in rootDir as .brs
                fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\nend sub`);
                fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

                // Create a source map that maps staging .brs back to .bs source
                const sourceNode = new SourceNode(null, null, null, [
                    new SourceNode(1, 0, s`${sourceDir1}/source/main.bs`, 'sub main()\n'),
                    new SourceNode(2, 0, s`${sourceDir1}/source/main.bs`, '    print 1\n'),
                    new SourceNode(3, 0, s`${sourceDir1}/source/main.bs`, 'end sub')
                ]);
                const result = sourceNode.toStringWithSourceMap();
                fsExtra.writeFileSync(`${stagingDir}/source/main.brs.map`, JSON.stringify(result.map));
                sourceMapManager.set(`${stagingDir}/source/main.brs.map`, JSON.stringify(result.map));

                bpManager.replaceBreakpoints(s`${sourceDir1}/source/main.bs`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint should be verified because staging file is .brs
                const bp = bpManager['getBreakpointsForFile'](s`${sourceDir1}/source/main.bs`)[0];
                expect(bp.verified).to.be.true;
            });

            it('rejects breakpoints when staging file is not .brs or .xml (e.g. .json)', async () => {
                // Scenario: Python that does NOT compile to BrightScript.
                // src/source/script.py => dist/source/script.json => stagingDir/source/script.json
                // The staging file is .json, so the breakpoint should be rejected.
                fsExtra.writeFileSync(`${rootDir}/source/script.json`, `{"main": true}`);
                fsExtra.copyFileSync(`${rootDir}/source/script.json`, `${stagingDir}/source/script.json`);

                bpManager.replaceBreakpoints(s`${rootDir}/source/script.json`, [{ line: 1 }]);

                let unsupportedEvent: { breakpoints: any[] } | undefined;
                bpManager.on('breakpoints-changed', (data) => {
                    unsupportedEvent = data;
                });

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // The .json file should NOT have STOP injected
                expect(fsExtra.readFileSync(`${stagingDir}/source/script.json`).toString()).not.to.contain('STOP');

                // Breakpoint should be marked as failed
                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/script.json`)[0];
                expect(bp.verified).to.be.false;
                expect(bp.reason).to.equal('failed');
                expect(bp.message).to.contain('.json');
                expect(bp.message).to.contain('not a supported Roku file type');

                // The event is queued via process.nextTick, so wait for it
                await new Promise<void>(resolve => {
                    process.nextTick(resolve);
                });
                expect(unsupportedEvent).to.exist;
                expect(unsupportedEvent.breakpoints).to.have.lengthOf(1);
            });

            it('rejects breakpoints for .py files that transpile to .json in staging', async () => {
                // Scenario: Python → JSON (not BrightScript).
                // Breakpoint in .py, source map points to .py, but staging file is .json.
                fsExtra.writeFileSync(`${sourceDir1}/source/utils.py`, `def hello():\n    print("hi")\n`);
                fsExtra.writeFileSync(`${rootDir}/source/utils.json`, `{"hello": true}\n`);
                fsExtra.copyFileSync(`${rootDir}/source/utils.json`, `${stagingDir}/source/utils.json`);

                // Source map from .json back to .py
                const sourceNode = new SourceNode(null, null, null, [
                    new SourceNode(1, 0, s`${sourceDir1}/source/utils.py`, '{"hello": true}\n'),
                    new SourceNode(2, 0, s`${sourceDir1}/source/utils.py`, '\n'),
                    new SourceNode(3, 0, s`${sourceDir1}/source/utils.py`, '')
                ]);
                const result = sourceNode.toStringWithSourceMap();
                fsExtra.writeFileSync(`${stagingDir}/source/utils.json.map`, JSON.stringify(result.map));
                sourceMapManager.set(`${stagingDir}/source/utils.json.map`, JSON.stringify(result.map));

                bpManager.replaceBreakpoints(s`${sourceDir1}/source/utils.py`, [{ line: 2 }]);

                let unsupportedEvent: { breakpoints: any[] } | undefined;
                bpManager.on('breakpoints-changed', (data) => {
                    unsupportedEvent = data;
                });

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // .json file should NOT have STOP injected
                expect(fsExtra.readFileSync(`${stagingDir}/source/utils.json`).toString()).not.to.contain('STOP');

                // Breakpoint should be marked as failed
                const bp = bpManager['getBreakpointsForFile'](s`${sourceDir1}/source/utils.py`)[0];
                expect(bp.verified).to.be.false;
                expect(bp.reason).to.equal('failed');

                // The event is queued via process.nextTick, so wait for it
                await new Promise<void>(resolve => {
                    process.nextTick(resolve);
                });
                expect(unsupportedEvent).to.exist;
            });

            it('allows .py breakpoints when they transpile to .brs in staging', async () => {
                // Scenario: Hypothetical py-to-brs tool.
                // src/source/main.py => dist/source/main.brs => stagingDir/source/main.brs
                // The staging file is .brs so the breakpoint should be accepted.
                fsExtra.writeFileSync(`${sourceDir1}/source/main.py`, `sub main()\n    print 1\nend sub`);
                fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\nend sub`);
                fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

                // Source map from .brs back to .py
                const sourceNode = new SourceNode(null, null, null, [
                    new SourceNode(1, 0, s`${sourceDir1}/source/main.py`, 'sub main()\n'),
                    new SourceNode(2, 0, s`${sourceDir1}/source/main.py`, '    print 1\n'),
                    new SourceNode(3, 0, s`${sourceDir1}/source/main.py`, 'end sub')
                ]);
                const result = sourceNode.toStringWithSourceMap();
                fsExtra.writeFileSync(`${stagingDir}/source/main.brs.map`, JSON.stringify(result.map));
                sourceMapManager.set(`${stagingDir}/source/main.brs.map`, JSON.stringify(result.map));

                bpManager.replaceBreakpoints(s`${sourceDir1}/source/main.py`, [{ line: 2 }]);

                const verifiedEvents: AugmentedSourceBreakpoint[] = [];
                bpManager.on('breakpoints-changed', (data) => {
                    verifiedEvents.push(...data.breakpoints);
                });

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint SHOULD be verified because staging file is .brs
                const bp = bpManager['getBreakpointsForFile'](s`${sourceDir1}/source/main.py`)[0];
                expect(bp.verified).to.be.true;

                // Wait for queued events, then verify none were marked as unsupported
                await new Promise<void>(resolve => {
                    process.nextTick(resolve);
                });
                expect(verifiedEvents.every(b => b.reason !== 'failed')).to.be.true;
            });

            it('does not include unsupported breakpoints in getDiff results', async () => {
                // Breakpoints in unsupported files should not appear in diff work items
                fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\nend sub`);
                fsExtra.writeFileSync(`${rootDir}/source/script.json`, `{"main": true}`);
                fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);
                fsExtra.copyFileSync(`${rootDir}/source/script.json`, `${stagingDir}/source/script.json`);

                bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{ line: 2 }]);
                bpManager.replaceBreakpoints(s`${rootDir}/source/script.json`, [{ line: 1 }]);

                const project = new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                });

                const diff = await bpManager.getDiff([project]);

                // Only the .brs breakpoint should appear in the diff
                expect(diff.added).to.have.lengthOf(1);
                expect(diff.added[0].pkgPath).to.equal('pkg:/source/main.brs');
            });

            it('does not crash when file extension cannot be determined', async () => {
                // Safety: if somehow a staging file has no extension, allow it through
                fsExtra.writeFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\nend sub`);
                fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

                bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{ line: 2 }]);

                // This should not throw
                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));
            });

            it('rejects breakpoints in manifest files', async () => {
                // The manifest file is not a debuggable file type
                fsExtra.writeFileSync(`${rootDir}/manifest`, `title=MyApp\nmajor_version=1\nminor_version=0`);
                fsExtra.copyFileSync(`${rootDir}/manifest`, `${stagingDir}/manifest`);

                bpManager.replaceBreakpoints(s`${rootDir}/manifest`, [{ line: 1 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint should be marked as failed
                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/manifest`)[0];
                expect(bp.verified).to.be.false;
                expect(bp.reason).to.equal('failed');
                expect(bp.message).to.contain('not a supported Roku file type');
            });

            it('allows breakpoints in non-standard extension files referenced by XML <script> tags', async () => {
                // Roku loads any file referenced by <script uri="..."> as BrightScript,
                // regardless of the file extension. So pkg:/source/lib.abc is valid if
                // an XML component references it.
                const libContent = `sub doStuff()\n    print "hello"\nend sub`;
                fsExtra.writeFileSync(`${rootDir}/source/lib.abc`, libContent);
                fsExtra.copyFileSync(`${rootDir}/source/lib.abc`, `${stagingDir}/source/lib.abc`);

                // Create an XML component that references the .abc file via <script>
                fsExtra.ensureDirSync(`${stagingDir}/components`);
                fsExtra.writeFileSync(`${stagingDir}/components/MyComp.xml`, [
                    '<component name="MyComp" extends="Group">',
                    '    <script type="text/brightscript" uri="pkg:/source/lib.abc" />',
                    '</component>'
                ].join('\n'));

                bpManager.replaceBreakpoints(s`${rootDir}/source/lib.abc`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint should be verified because the file is referenced by a <script> tag
                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/lib.abc`)[0];
                expect(bp.verified).to.be.true;
                // STOP should be injected into the file
                expect(fsExtra.readFileSync(`${stagingDir}/source/lib.abc`).toString()).to.contain('STOP');
            });

            it('rejects breakpoints in non-standard extension files NOT referenced by XML <script> tags', async () => {
                // A .abc file that is NOT referenced by any XML <script> tag should be rejected
                const libContent = `some random content`;
                fsExtra.writeFileSync(`${rootDir}/source/lib.abc`, libContent);
                fsExtra.copyFileSync(`${rootDir}/source/lib.abc`, `${stagingDir}/source/lib.abc`);

                // Create an XML component that does NOT reference lib.abc
                fsExtra.ensureDirSync(`${stagingDir}/components`);
                fsExtra.writeFileSync(`${stagingDir}/components/MyComp.xml`, [
                    '<component name="MyComp" extends="Group">',
                    '    <script type="text/brightscript" uri="pkg:/source/other.brs" />',
                    '</component>'
                ].join('\n'));

                bpManager.replaceBreakpoints(s`${rootDir}/source/lib.abc`, [{ line: 1 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                // Breakpoint should be rejected
                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/lib.abc`)[0];
                expect(bp.verified).to.be.false;
                expect(bp.reason).to.equal('failed');
            });

            it('allows breakpoints in files referenced by relative URI in <script> tags', async () => {
                // <script uri="./Animator.brs" /> is relative to the XML file's directory
                const libContent = `sub animate()\n    print "go"\nend sub`;
                fsExtra.ensureDirSync(`${rootDir}/components`);
                fsExtra.ensureDirSync(`${stagingDir}/components`);
                fsExtra.writeFileSync(`${rootDir}/components/Animator.xyz`, libContent);
                fsExtra.copyFileSync(`${rootDir}/components/Animator.xyz`, `${stagingDir}/components/Animator.xyz`);

                fsExtra.writeFileSync(`${stagingDir}/components/Animator.xml`, [
                    '<component name="Animator" extends="Node">',
                    '    <script type="text/brightscript" uri="./Animator.xyz" />',
                    '</component>'
                ].join('\n'));

                bpManager.replaceBreakpoints(s`${rootDir}/components/Animator.xyz`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/components/Animator.xyz`)[0];
                expect(bp.verified).to.be.true;
            });

            it('allows breakpoints in files referenced by parent-relative URI in <script> tags', async () => {
                // <script uri="../../source/lib.dat" /> traverses up from the XML file
                const libContent = `sub helper()\n    print "help"\nend sub`;
                fsExtra.writeFileSync(`${rootDir}/source/lib.dat`, libContent);
                fsExtra.copyFileSync(`${rootDir}/source/lib.dat`, `${stagingDir}/source/lib.dat`);

                fsExtra.ensureDirSync(`${stagingDir}/components/nested`);
                fsExtra.writeFileSync(`${stagingDir}/components/nested/Deep.xml`, [
                    '<component name="Deep" extends="Node">',
                    '    <script type="text/brightscript" uri="../../source/lib.dat" />',
                    '</component>'
                ].join('\n'));

                bpManager.replaceBreakpoints(s`${rootDir}/source/lib.dat`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/lib.dat`)[0];
                expect(bp.verified).to.be.true;
            });

            it('allows breakpoints in files referenced by libpkg:/ URI in <script> tags', async () => {
                // libpkg:/ is used for component library imports, resolves same as pkg:/
                const libContent = `sub libFunc()\n    print "lib"\nend sub`;
                fsExtra.writeFileSync(`${rootDir}/source/libcode.custom`, libContent);
                fsExtra.copyFileSync(`${rootDir}/source/libcode.custom`, `${stagingDir}/source/libcode.custom`);

                fsExtra.ensureDirSync(`${stagingDir}/components`);
                fsExtra.writeFileSync(`${stagingDir}/components/LibComp.xml`, [
                    '<component name="LibComp" extends="Node">',
                    '    <script type="text/brightscript" uri="libpkg:/source/libcode.custom" />',
                    '</component>'
                ].join('\n'));

                bpManager.replaceBreakpoints(s`${rootDir}/source/libcode.custom`, [{ line: 2 }]);

                await bpManager.writeBreakpointsForProject(new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    stagingDir: stagingDir
                }));

                const bp = bpManager['getBreakpointsForFile'](s`${rootDir}/source/libcode.custom`)[0];
                expect(bp.verified).to.be.true;
            });
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
            bpManager.setBreakpoint(src, {
                line: 5
            });
            bpManager.setBreakpoint(src, {
                line: 7
            });

            await bpManager.writeBreakpointsForProject(new Project({
                files: [
                    'main.brs'
                ],
                rootDir: s`${tmpDir}/dist`,
                outDir: s`${tmpDir}/out`,
                stagingDir: stagingDir,
                enhanceREPLCompletions: false
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
            let srcPath = 'program.brs';
            function n(line, col, txt) {
                return new SourceNode(line, col, srcPath, txt);
            }
            //here's the sample code we are testing
            /**
                sub main()
                    print 1
                end function
            */
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
            let sourceFilePath = s`${srcDir}/source/main.bs`;
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

            bpManager.setBreakpoint(sourceFilePath, {
                line: 3,
                column: 0
            });

            await bpManager.writeBreakpointsForProject(new Project({
                files: [
                    'source/main.brs'
                ],
                stagingDir: stagingDir,
                outDir: outDir,
                rootDir: rootDir,
                enhanceREPLCompletions: false
            }));

            //use sourcemap to look up original location
            let location = await locationManager.getSourceLocation({
                stagingFilePath: s`${stagingDir}/source/main.brs`,
                columnIndex: 0,
                lineNumber: 2,
                fileMappings: [],
                rootDir: rootDir,
                stagingDir: stagingDir,
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
            fsExtra.outputFileSync(`${rootDir}/source/main.brs`, codeAndMap.code);
            fsExtra.outputFileSync(`${rootDir}/source/main.brs.map`, codeAndMap.map.toString());

            //copy to staging
            fsExtra.outputFileSync(`${stagingDir}/source/main.brs`, codeAndMap.code);
            fsExtra.outputFileSync(`${stagingDir}/source/main.brs.map`, codeAndMap.map.toString());

            //the sourcemap in staging should point to src
            expect(
                (await sourceMapManager.getSourceMap(`${stagingDir}/source/main.brs.map`)).sources
            ).to.eql([
                sourceFilePath
            ]);

            //write breakpoints
            bpManager.setBreakpoint(sourceFilePath, {
                line: 4,
                column: 0
            });

            await bpManager.writeBreakpointsForProject(new Project({
                files: [
                    'source/main.brs'
                ],
                stagingDir: stagingDir,
                outDir: outDir,
                rootDir: rootDir,
                enhanceREPLCompletions: false
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
        bpManager.setBreakpoint(baseFilePath, {
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
            stagingDir: stagingDir,
            outDir: outDir,
            rootDir: rootDir,
            enhanceREPLCompletions: false
        });
        await project.stage();
        await bpManager.writeBreakpointsForProject(project);

        //the source map for version.brs should point to base, not main
        let source = await sourceMapManager.getSourceMap(s`${stagingDir}/source/environment.brs.map`);
        expect(source.sources).to.eql([
            baseFilePath
        ]);
    });

    it('adds breakpoint keys', () => {
        expect(
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 2
            }, {
                line: 3,
                condition: 'true'
            }, {
                line: 4,
                hitCondition: '2'
            }, {
                line: 5,
                column: 12
            }, {
                line: 6,
                logMessage: 'hello world'
            }]).map(x => x.srcHash).sort()
        ).to.eql([
            s`${rootDir}/source/main.brs:2:0-standard`,
            s`${rootDir}/source/main.brs:3:0-condition=true`,
            s`${rootDir}/source/main.brs:4:0-hitCondition=2`,
            s`${rootDir}/source/main.brs:5:12-standard`,
            s`${rootDir}/source/main.brs:6:0-logMessage=hello world`
        ].sort());
    });

    it('does not duplicate breakpoints that have the same key', () => {
        const pkgPath = s`${rootDir}/source/main.brs`;
        bpManager.setBreakpoint(pkgPath, {
            line: 2
        });
        bpManager.setBreakpoint(pkgPath, {
            line: 2
        });
        expect(
            bpManager['getBreakpointsForFile'](pkgPath).map(x => x.srcHash)
        ).to.eql([
            s`${pkgPath}:2:0-standard`
        ]);
    });

    it('replaces breakpoints with distinct attributes', () => {
        const pkgPath = s`${rootDir}/source/main.brs`;

        bpManager.setBreakpoint(pkgPath, {
            line: 2
        });
        expect(
            bpManager['getBreakpointsForFile'](pkgPath).map(x => x.srcHash)
        ).to.eql([
            s`${pkgPath}:2:0-standard`
        ]);

        bpManager.setBreakpoint(pkgPath, {
            line: 2,
            condition: 'true'
        });
        expect(
            bpManager['getBreakpointsForFile'](pkgPath).map(x => x.srcHash)
        ).to.eql([
            s`${pkgPath}:2:0-condition=true`
        ]);

        bpManager.setBreakpoint(pkgPath, {
            line: 2,
            hitCondition: '4'
        });
        expect(
            bpManager['getBreakpointsForFile'](pkgPath).map(x => x.srcHash)
        ).to.eql([
            s`${pkgPath}:2:0-hitCondition=4`
        ]);
    });

    it('keeps breakpoints verified if they did not change', () => {
        let breakpoints = bpManager.replaceBreakpoints(srcPath, [{
            line: 10
        }]);
        //mark this breakpoint as verified
        breakpoints[0].verified = true;

        breakpoints = bpManager.replaceBreakpoints(srcPath, [{
            line: 10
        }, {
            line: 11
        }]);

        expectPickEquals(breakpoints, [{
            line: 10,
            verified: true
        }, {
            line: 11,
            verified: false
        }]);
    });

    describe('getDiff', () => {
        async function testDiffEquals(
            expected?: {
                added?: Array<Partial<BreakpointWorkItem>>;
                removed?: Array<Partial<BreakpointWorkItem>>;
                unchanged?: Array<Partial<BreakpointWorkItem>>;
            },
            projects = [projectManager.mainProject, ...projectManager.componentLibraryProjects]
        ) {
            const diff = await bpManager.getDiff(projects);
            //filter the result by the list of properties from each test value
            expected = {
                added: [],
                removed: [],
                unchanged: [],
                ...expected ?? {}
            };
            const actual = {
                added: pickArray(diff.added, expected.added),
                removed: pickArray(diff.removed, expected.removed),
                unchanged: pickArray(diff.unchanged, expected.unchanged)
            };

            expect(actual).to.eql(expected);

            return diff;
        }

        it('returns empty diff when no projects are present', async () => {
            await testDiffEquals({ added: [], removed: [], unchanged: [] }, []);
        });

        it('returns empty diff when no breakpoints are registered', async () => {
            await testDiffEquals({ added: [], removed: [], unchanged: [] });
        });

        it('recovers from invalid sourceDirs', async () => {
            bpManager.launchConfiguration = {
                ...(bpManager?.launchConfiguration ?? {} as any),
                sourceDirs: ['source/**/*', 'components/**/*']
            };

            bpManager.replaceBreakpoints(`${rootDir}/components/tasks/baseTask.brs`, [{ line: 2 }]);
            bpManager.replaceBreakpoints(`${rootDir}/source/main.brs`, [{ line: 2 }]);
            let diff = await testDiffEquals({
                added: [{
                    pkgPath: 'pkg:/components/tasks/baseTask.brs',
                    line: 2
                }, {
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });

            //set the deviceId for the breakpoints
            bpManager.setBreakpointDeviceId(diff.added[0].srcHash, diff.added[0].destHash, 1);
            bpManager.setBreakpointDeviceId(diff.added[1].srcHash, diff.added[1].destHash, 2);

            //mark the breakpoints as verified
            bpManager.verifyBreakpoint(1, true);
            bpManager.verifyBreakpoint(2, true);

            //call the getDiff a few more times
            await testDiffEquals({
                unchanged: [{
                    pkgPath: 'pkg:/components/tasks/baseTask.brs',
                    line: 2
                }, {
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });
            await testDiffEquals({
                unchanged: [{
                    pkgPath: 'pkg:/components/tasks/baseTask.brs',
                    line: 2
                }, {
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });

            //add another breakpoint to the list
            bpManager.replaceBreakpoints(`${rootDir}/source/main.brs`, [{ line: 2 }, { line: 7 }]);

            await testDiffEquals({
                added: [{
                    pkgPath: 'pkg:/source/main.brs',
                    line: 7
                }],
                unchanged: [{
                    pkgPath: 'pkg:/components/tasks/baseTask.brs',
                    line: 2
                }, {
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });
        });


        it('handles breakpoint flow', async () => {
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 2
            }]);
            //breakpoint should show up first time
            await testDiffEquals({
                added: [{
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });

            //should show as "unchanged" now
            await testDiffEquals({
                unchanged: [{
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });

            //remove the breakpoint
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, []);

            //breakpoint should be in the "removed" bucket
            await testDiffEquals({
                removed: [{
                    pkgPath: 'pkg:/source/main.brs',
                    line: 2
                }]
            });

            //there should be no breakpoint changes
            await testDiffEquals();
        });

        it('detects hitCount change', async () => {
            //add breakpoint with hit condition
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 2,
                hitCondition: '2'
            }]);

            await testDiffEquals({
                added: [{
                    line: 2,
                    hitCondition: '2'
                }]
            });

            //change the breakpoint hit condition
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 2,
                hitCondition: '1'
            }]);

            await testDiffEquals({
                removed: [{
                    line: 2,
                    hitCondition: '2'
                }],
                added: [{
                    line: 2,
                    hitCondition: '1'
                }]
            });
        });

        it('does not create work for inline breakpoints', async () => {
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 2,
                column: 4
            }]);

            await testDiffEquals({
                added: []
            });

            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 2,
                column: 8
            }]);

            await testDiffEquals({
                removed: [],
                added: []
            });
        });

        it('accounts for complib filename postfixes', async () => {
            bpManager.replaceBreakpoints(s`${rootDir}/source/main.brs`, [{
                line: 1
            }]);

            bpManager.replaceBreakpoints(s`${complib1RootDir}/source/main.brs`, [{
                line: 2
            }]);

            bpManager.replaceBreakpoints(s`${complib2RootDir}/source/main.brs`, [{
                line: 3
            }]);

            await testDiffEquals({
                added: [{
                    line: 1,
                    pkgPath: 'pkg:/source/main.brs'
                }, {
                    line: 2,
                    pkgPath: 'pkg:/source/main__lib0.brs'
                }, {
                    line: 3,
                    pkgPath: 'pkg:/source/main__lib1.brs'
                }], removed: [], unchanged: []
            });
        });

        it('includes the deviceId in all breakpoints when possible', async () => {
            const bp = bpManager.setBreakpoint(srcPath, { line: 1 });

            let diff = await bpManager.getDiff(projectManager.getAllProjects());
            expect(diff.added[0].deviceId).not.to.exist;

            bpManager.setBreakpointDeviceId(bp.srcHash, diff.added[0].destHash, 3);

            bpManager.deleteBreakpoint(srcPath, bp);

            diff = await bpManager.getDiff(projectManager.getAllProjects());

            expect(diff.removed[0].deviceId).to.eql(3);
        });
    });
});
