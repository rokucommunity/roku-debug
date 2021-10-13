// import { expect } from 'chai';
// import * as fsExtra from 'fs-extra';
// import { SourceMapConsumer, SourceNode } from 'source-map';

// import { fileUtils, standardizePath as s } from '../FileUtils';
// import { Project } from '../managers/ProjectManager';
// let n = fileUtils.standardizePath.bind(fileUtils);
// import type { SourceLocation } from '../managers/LocationManager';
// import { LocationManager } from '../managers/LocationManager';
// import { SourceMapManager } from '../managers/SourceMapManager';

// describe('BreakpointManager', () => {
//     const cwd = process.cwd();
//     let tmpDir = s`${cwd}/.tmp`;
//     let rootDir = s`${tmpDir}/rootDir`;
//     let stagingDir = s`${tmpDir}/stagingDir`;
//     let distDir = s`${tmpDir}/dist`;
//     let srcDir = s`${tmpDir}/src`;
//     let outDir = s`${tmpDir}/out`;

//     let bpManager: BreakpointManager;
//     let locationManager: LocationManager;
//     let sourceMapManager: SourceMapManager;
//     //cast the manager as any to simplify some of the tests
//     let b: any;
//     beforeEach(() => {
//         fsExtra.ensureDirSync(tmpDir);
//         fsExtra.emptyDirSync(tmpDir);
//         fsExtra.ensureDirSync(`${rootDir}/source`);
//         fsExtra.ensureDirSync(`${stagingDir}/source`);
//         fsExtra.ensureDirSync(`${distDir}/source`);
//         fsExtra.ensureDirSync(`${srcDir}/source`);
//         fsExtra.ensureDirSync(outDir);

//         sourceMapManager = new SourceMapManager();
//         locationManager = new LocationManager(sourceMapManager);
//         bpManager = new BreakpointManager(sourceMapManager, locationManager);
//         b = bpManager;
//     });

//     afterEach(() => {
//         fsExtra.removeSync(tmpDir);
//     });

//     describe('setBreakpointsForFile', () => {
//         it('verifies all breakpoints before launch', () => {
//             let breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
//                 line: 0,
//                 column: 0
//             }, {
//                 line: 1,
//                 column: 0
//             }]);
//             expect(breakpoints).to.be.lengthOf(2);
//             expect(breakpoints[0]).to.include({
//                 line: 0,
//                 column: 0,
//                 verified: true,
//                 wasAddedBeforeLaunch: true
//             });
//             expect(breakpoints[1]).to.include({
//                 line: 1,
//                 column: 0,
//                 verified: true,
//                 wasAddedBeforeLaunch: true
//             });
//         });

//         it('does not verify breakpoints after launch', () => {
//             bpManager.lockBreakpoints();
//             let breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
//                 line: 0,
//                 column: 0
//             }]);
//             expect(breakpoints).to.be.lengthOf(1);
//             expect(breakpoints[0]).to.deep.include({
//                 line: 0,
//                 column: 0,
//                 verified: false,
//                 wasAddedBeforeLaunch: false
//             });
//         });

//         it('re-verifies breakpoint after launch toggle', () => {
//             //set the breakpoint before launch
//             let breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
//                 line: 2
//             }]);
//             expect(breakpoints).to.be.lengthOf(1);
//             expect(breakpoints[0]).to.deep.include({
//                 line: 2,
//                 column: 0,
//                 verified: true,
//                 isHidden: false
//             });

//             //launch
//             bpManager.lockBreakpoints();

//             //simulate user deleting all breakpoints
//             breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, []);

//             expect(breakpoints).to.be.lengthOf(1);
//             expect(breakpoints[0]).to.deep.include({
//                 line: 2,
//                 verified: true,
//                 isHidden: true
//             });

//             //simulate user adding a breakpoint to the same place it had been before
//             breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
//                 line: 2
//             }]);
//             expect(breakpoints).to.be.lengthOf(1);
//             expect(breakpoints[0]).to.deep.include({
//                 line: 2,
//                 column: 0,
//                 verified: true,
//                 wasAddedBeforeLaunch: true,
//                 isHidden: false
//             });
//         });
//     });

//     describe('writeBreakpointsToFile', () => {
//         it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
//             fsExtra.ensureDirSync(s`${tmpDir}/dist`);
//             let src = s`${rootDir}/main.bs`;

//             //create the source file
//             fsExtra.writeFileSync(src,
//                 '\n' +
//                 '\n' +
//                 '\n' +
//                 'function main()\n' +
//                 '    orig1 = 1\n' +
//                 '    orig2 = 2\n' +
//                 '    orig3 = 3\n' +
//                 'end function'
//             );

//             //create the "compiled" dist file
//             let chunks = [
//                 new SourceNode(4, 0, src, 'function main()\n'),
//                 new SourceNode(5, 0, src, '    orig1 = 1\n'),
//                 '    injected1 = 1\n',
//                 new SourceNode(6, 0, src, '    orig2 = 2\n'),
//                 '    injected2 = 2\n',
//                 new SourceNode(7, 0, src, '    orig3 = 3\n'),
//                 '    injected3 = 3\n',
//                 new SourceNode(8, 0, src, 'end function')
//             ];
//             let result = new SourceNode(null, null, src, chunks).toStringWithSourceMap();
//             fsExtra.writeFileSync(s`${tmpDir}/dist/main.brs`, result.code);
//             fsExtra.writeFileSync(s`${tmpDir}/dist/main.brs.map`, result.map.toString());

//             fsExtra.writeFileSync(s`${stagingDir}/main.brs`, result.code);
//             fsExtra.writeFileSync(s`${stagingDir}/main.brs.map`, result.map.toString());

//             //set a few breakpoints in the source files
//             bpManager.registerBreakpoint(src, {
//                 line: 5
//             });
//             bpManager.registerBreakpoint(src, {
//                 line: 7
//             });

//             await bpManager.writeBreakpointsForProject(new Project({
//                 files: [
//                     'main.brs'
//                 ],
//                 rootDir: s`${tmpDir}/dist`,
//                 outDir: s`${tmpDir}/out`,
//                 stagingFolderPath: stagingDir
//             }));

//             //the breakpoints should be placed in the proper locations
//             expect(fsExtra.readFileSync(s`${stagingDir}/main.brs`).toString()).to.eql(
//                 'function main()\n' +
//                 'STOP\n' +
//                 '    orig1 = 1\n' +
//                 '    injected1 = 1\n' +
//                 '    orig2 = 2\n' +
//                 '    injected2 = 2\n' +
//                 'STOP\n' +
//                 '    orig3 = 3\n' +
//                 '    injected3 = 3\n' +
//                 'end function'
//             );
//         });

//         //this is just a sample test to show how we need to create
//         it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
//             let srcPath = 'program.brs';
//             function n(line, col, txt) {
//                 return new SourceNode(line, col, srcPath, txt);
//             }
//             let src =
//                 'sub main()\n' +
//                 '\n' +
//                 '    print 1\n' +
//                 '\n' +
//                 'end function';

//             //remove empty newlines
//             let chunks = [
//                 n(1, 0, 'sub'), ' ', n(1, 4, 'main'), n(1, 8, '('), n(1, 9, ')'), '\n',
//                 '    ', n(3, 4, 'print'), ' ', n(3, 11, '1'), '\n',
//                 n(5, 0, 'end'), ' ', n(5, 4, 'function')
//             ];
//             let result = new SourceNode(null, null, srcPath, chunks).toStringWithSourceMap();
//             let position = await SourceMapConsumer.with(result.map.toJSON(), null, (consumer) => {
//                 return consumer.generatedPositionFor({
//                     line: 3,
//                     column: 0,
//                     source: srcPath,
//                     //bias is critical. Without this, we would default to the last char of previous line
//                     bias: SourceMapConsumer.LEAST_UPPER_BOUND
//                 });
//             });
//             expect({ line: position.line, column: position.column }).to.eql({
//                 line: 2,
//                 column: 4
//             });
//         });

//         //this is just a sample test to show how we need to create
//         it('places breakpoints at corect spot in out file when sourcemaps are involved', async () => {
//             let sourceFilePath = s`${srcDir}/source/main.bs`;
//             function n(line, col, txt) {
//                 return new SourceNode(line, col, sourceFilePath, txt);
//             }
//             let sourceFile =
//                 'sub main()\n' +
//                 '\n' +
//                 '    print 1\n' +
//                 '\n' +
//                 'end function';
//             //remove empty newlines
//             let chunks = [
//                 n(1, 0, 'sub'), ' ', n(1, 4, 'main'), n(1, 8, '('), n(1, 9, ')'), '\n',
//                 n(3, 0, '    '), n(3, 4, 'print'), ' ', n(3, 11, '1'), '\n',
//                 n(5, 0, 'end'), ' ', n(5, 4, 'function')
//             ];
//             let result = new SourceNode(null, null, sourceFilePath, chunks).toStringWithSourceMap();

//             //write the files
//             fsExtra.writeFileSync(sourceFilePath, sourceFile);

//             fsExtra.writeFileSync(`${rootDir}/source/main.brs`, result.code);
//             fsExtra.writeFileSync(`${rootDir}/source/main.brs.map`, result.map.toString());

//             fsExtra.writeFileSync(`${stagingDir}/source/main.brs`, result.code);
//             fsExtra.writeFileSync(`${stagingDir}/source/main.brs.map`, result.map.toString());

//             //sanity check: verify the original source map is useable
//             let position = await SourceMapConsumer.with(result.map.toJSON(), null, (consumer) => {
//                 return consumer.generatedPositionFor({
//                     line: 3,
//                     column: 4,
//                     source: sourceFilePath,
//                     //bias is critical. Without this, we would default to the last char of previous line
//                     bias: SourceMapConsumer.LEAST_UPPER_BOUND
//                 });
//             });
//             expect(position).to.include({
//                 line: 2,
//                 column: 4
//             });

//             bpManager.registerBreakpoint(sourceFilePath, {
//                 line: 3,
//                 column: 0
//             });

//             await bpManager.writeBreakpointsForProject(new Project({
//                 files: [
//                     'source/main.brs'
//                 ],
//                 stagingFolderPath: stagingDir,
//                 outDir: outDir,
//                 rootDir: rootDir
//             }));

//             //use sourcemap to look up original location
//             let location = await locationManager.getSourceLocation({
//                 stagingFilePath: s`${stagingDir}/source/main.brs`,
//                 columnIndex: 0,
//                 lineNumber: 2,
//                 fileMappings: [],
//                 rootDir: rootDir,
//                 stagingFolderPath: stagingDir,
//                 enableSourceMaps: true
//             });

//             expect(location).to.include({
//                 columnIndex: 0,
//                 lineNumber: 3,
//                 filePath: sourceFilePath
//             } as SourceLocation);
//         });

//         it('replaces in-memory cache when creating breakpoint source map', async () => {
//             let sourceFilePath = s`${srcDir}/source/main.brs`;
//             function n(line, col, txt) {
//                 return new SourceNode(line, col, sourceFilePath, txt);
//             }
//             //the original file had spaces between each print line
//             let codeAndMap = new SourceNode(null, null, sourceFilePath, [
//                 n(1, 0, 'sub Main(inputARguments as object)\n'),
//                 n(2, 0, '    print "first"\n'),
//                 n(3, 0, '    print "second"\n'),
//                 n(7, 0, 'end sub')
//             ]).toStringWithSourceMap();

//             //copy to rootDir
//             fsExtra.outputFileSync(`${rootDir}/source/main.brs`, codeAndMap.code);
//             fsExtra.outputFileSync(`${rootDir}/source/main.brs.map`, codeAndMap.map.toString());

//             //copy to staging
//             fsExtra.outputFileSync(`${stagingDir}/source/main.brs`, codeAndMap.code);
//             fsExtra.outputFileSync(`${stagingDir}/source/main.brs.map`, codeAndMap.map.toString());

//             //the sourcemap in staging should point to src
//             expect(
//                 (await sourceMapManager.getSourceMap(`${stagingDir}/source/main.brs.map`)).sources
//             ).to.eql([
//                 sourceFilePath
//             ]);

//             //write breakpoints
//             bpManager.registerBreakpoint(sourceFilePath, {
//                 line: 4,
//                 column: 0
//             });

//             await bpManager.writeBreakpointsForProject(new Project({
//                 files: [
//                     'source/main.brs'
//                 ],
//                 stagingFolderPath: stagingDir,
//                 outDir: outDir,
//                 rootDir: rootDir
//             }));

//             //the in-memory cached source map should have been updated to point to rootDir
//             expect(
//                 (await sourceMapManager.getSourceMap(`${stagingDir}/source/main.brs.map`)).sources
//             ).to.eql([
//                 s`${rootDir}/source/main.brs`
//             ]);
//         });
//     });

//     it('properly handles roku-deploy file overriding', async () => {
//         let baseDir = s`${tmpDir}/base`;
//         let baseFilePath = s`${baseDir}/source/environment.brs`;
//         fsExtra.ensureDirSync(s`${baseDir}/source`);
//         fsExtra.writeFileSync(baseFilePath, `
//             sub GetEnvironmentName()
//                 return "base"
//             end sub
//         `);

//         //write breakpoints
//         bpManager.registerBreakpoint(baseFilePath, {
//             line: 2,
//             column: 0
//         });
//         let project = new Project({
//             files: [
//                 'source/**/*',
//                 //override the source file with the one from base
//                 {
//                     src: '../base/**/*',
//                     dest: ''
//                 }
//             ],
//             stagingFolderPath: stagingDir,
//             outDir: outDir,
//             rootDir: rootDir
//         });
//         await project.stage();
//         await bpManager.writeBreakpointsForProject(project);

//         //the source map for version.brs should point to base, not main
//         let source = await sourceMapManager.getSourceMap(s`${stagingDir}/source/environment.brs.map`);
//         expect(source.sources).to.eql([
//             baseFilePath
//         ]);
//     });
// });
