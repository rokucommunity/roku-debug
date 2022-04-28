import { expect } from 'chai';
import { SourceMapManager } from '../managers/SourceMapManager';
import { BreakpointWriter } from './BreakpointWriter';
import { SourceMapConsumer, SourceNode } from 'source-map';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from '../FileUtils';
import { tmpDir, rootDir, outDir, stagingDir, sourceDirChild, sourceDirParent } from '../testHelpers.spec';
import type { AddProjectParams } from '../managers/ProjectManager';
import { Project } from '../managers/ProjectManager';
import type { BreakpointWorkItem } from './BreakpointMapper';
import { FileManager } from '../managers/FileManager';

describe.only('BreakpointWriter', () => {
    let writer: BreakpointWriter;
    let sourceMapManager: SourceMapManager;

    beforeEach(() => {
        sourceMapManager = new SourceMapManager();
        writer = new BreakpointWriter(sourceMapManager);
        fsExtra.emptyDirSync(`${rootDir}/source`);
        fsExtra.emptyDirSync(`${stagingDir}/source`);
        fsExtra.emptyDirSync(`${tmpDir}/source`);
        fsExtra.emptyDirSync(`${sourceDirChild}/source`);
        fsExtra.emptyDirSync(`${sourceDirParent}/source`);
    });

    describe('getSourceAndMapWithBreakpoints', () => {
        it('correctly injects standard breakpoints', () => {
            expect(writer.getSourceAndMapWithBreakpoints(`
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
            expect(writer.getSourceAndMapWithBreakpoints(`
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
            expect(writer.getSourceAndMapWithBreakpoints(`
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
            expect(writer.getSourceAndMapWithBreakpoints(`
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
            expect(writer.getSourceAndMapWithBreakpoints(`
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
            expect(writer.getSourceAndMapWithBreakpoints(`
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
            let result = writer.getSourceAndMapWithBreakpoints(`
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

    describe.only('writeBreakpointsForProject', () => {
        it('works with normal flow', async () => {
            fsExtra.outputFileSync(`${rootDir}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //copy the file to staging
            fsExtra.copySync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            await writeAndTestBreakpoints([{
                line: 3,
                finalLine: 4,
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${rootDir}/source/main.brs`
            }]);
        });

        it('works with sourceDirChild', async () => {
            //create file
            fsExtra.outputFileSync(`${sourceDirChild}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copySync(`${sourceDirChild}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically)
            fsExtra.copyFileSync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            await writeAndTestBreakpoints([{
                line: 3,
                finalLine: 4,
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirChild}/source/main.brs`
            }]);
        });

        it('works with file existing in second sourceDir but not first', async () => {
            //create file
            fsExtra.outputFileSync(`${sourceDirParent}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copySync(`${sourceDirParent}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copySync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            await writeAndTestBreakpoints([{
                line: 3,
                finalLine: 4,
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }]);
        });

        it('properly writes all types of breakpoints', async () => {
            //create file
            fsExtra.outputFileSync(`${sourceDirParent}/source/main.brs`, `
                sub main()
                    firstName="john"
                    print lastName="smith"
                    print firstName + " " + lastName
                end sub
            `);

            //mimic custom build by copying the file from sourceDir into rootDir
            fsExtra.copySync(`${sourceDirParent}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically
            fsExtra.copySync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            await writeAndTestBreakpoints([{
                line: 3,
                condition: 'true = true',
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }, {
                line: 4,
                logMessage: 'Hello {lastName}',
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }, {
                line: 5,
                hitCondition: '3',
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }]);

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
            fsExtra.writeFileSync(`${sourceDirChild}/source/main.brs`, `sub main()\n    print 1\n    print 2\nend sub`);

            //duplicate file in sourceDirChild
            fsExtra.copySync(`${sourceDirChild}/source/main.brs`, `${sourceDirParent}/source/main.brs`);

            //mimic custom build by copying the file from sourceDirParent into rootDir
            fsExtra.copySync(`${sourceDirParent}/source/main.brs`, `${rootDir}/source/main.brs`);

            //copy the file to staging (this is what the extension would normally do automatically)
            fsExtra.copySync(`${rootDir}/source/main.brs`, `${stagingDir}/source/main.brs`);

            //set the breakpoint before launch
            bpManager.replaceBreakpoints(s`${sourceDirChild}/source/main.brs`, [{
                line: 3,
                column: 0
            }]);
            bpManager.replaceBreakpoints(s`${sourceDirParent}/source/main.brs`, [{
                line: 3,
                column: 0
            }]);


            await writeAndTestBreakpoints([{
                line: 3,
                condition: 'true = true',
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }, {
                line: 4,
                logMessage: 'Hello {lastName}',
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }, {
                line: 5,
                hitCondition: '3',
                stagingPath: s`${stagingDir}/source/main.brs`,
                srcPath: s`${sourceDirParent}/source/main.brs`
            }]);


            //launch
            bpManager.lockBreakpoints();

            await writer.writeBreakpointsForProject(
                new Project(<any>{
                    rootDir: rootDir,
                    outDir: outDir,
                    sourceDirs: [sourceDirChild, sourceDirParent],
                    stagingFolderPath: stagingDir
                })
            );

            expect(fsExtra.readFileSync(`${stagingDir}/source/main.brs`).toString()).to.equal(`sub main()\n    print 1\nSTOP\n    print 2\nend sub`);
        });

        async function writeAndTestBreakpoints(breakpoints: Partial<BreakpointWorkItem & { finalLine: number }>[], project?: Partial<AddProjectParams>) {
            await writer.writeBreakpointsForProject(new Project({
                ...project ?? {},
                rootDir: rootDir,
                outDir: outDir,
                stagingFolderPath: stagingDir
            } as AddProjectParams), breakpoints as any);

            const files = new FileManager();

            const offsets = {};
            //verify each breakpoint was written at the correct spot
            for (const breakpoint of breakpoints) {
                // eslint-disable-next-line no-multi-assign
                const offset = offsets[breakpoint.stagingPath] = (offsets[breakpoint.stagingPath] ?? -1) + 1;
                const line = files.getCodeFile(breakpoint.stagingPath)?.lines[breakpoint.line - 1 + offset];

                if (breakpoint.logMessage) {
                    if (!line.trim().startsWith('PRINT')) {
                        throw new Error(`logpoint statement expected at ${breakpoint.stagingPath}:${breakpoint.line}, but instead found\n${line}`);
                    }

                    //hit condition breakpoints
                } else if (breakpoint.hitCondition) {
                    if (!line.includes('m.vscode_bp')) {
                        throw new Error(`hitpoint statement expected at ${breakpoint.stagingPath}:${breakpoint.line}, but instead found\n${line}`);
                    }

                    //line should have an injected STOP statement
                } else if (line.trim() !== 'stop' && !line.includes(': STOP :')) {
                    throw new Error(`STOP statement expected at ${breakpoint.stagingPath}:${breakpoint.line}, but instead found\n${line}`);
                }

                //sourcemap was created
                expect(fsExtra.pathExistsSync(`${stagingDir}/source/main.brs.map`)).to.be.true;

                //verify the sourcemap points to the original location
                expect(await sourceMapManager.getOriginalLocation(breakpoint.stagingPath, breakpoint.line + offset, 0)).to.eql({
                    columnIndex: 0,
                    lineNumber: breakpoint.line,
                    filePath: breakpoint.srcPath
                });
            }
        }
    });
});
