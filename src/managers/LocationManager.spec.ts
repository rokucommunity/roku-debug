import { expect } from 'chai';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { SourceMapConsumer, SourceNode } from 'source-map';

import { standardizePath as s } from '../FileUtils';
import { LocationManager } from './LocationManager';
import { SourceMapManager } from './SourceMapManager';

let cwd = s`${path.dirname(__dirname)}`;
let tmpDir = s`${cwd}/.tmp`;
const rootDir = s`${tmpDir}/rootDir`;
const stagingDir = s`${tmpDir}/stagingDir`;
const sourceDirs = [
    s`${tmpDir}/sourceDir0`,
    s`${tmpDir}/sourceDir1`,
    s`${tmpDir}/sourceDir2`
];

describe('LocationManager', () => {
    let files: Record<string, string>;
    let locationManager: LocationManager;
    let sourceMapManager: SourceMapManager;
    beforeEach(() => {
        sourceMapManager = new SourceMapManager();
        locationManager = new LocationManager(sourceMapManager);
        files = {};
        fsExtra.ensureDirSync(tmpDir);
        fsExtra.removeSync(tmpDir);
        fsExtra.ensureDirSync(`${rootDir}/source`);
        fsExtra.ensureDirSync(`${stagingDir}/source`);
        for (let sourceDir of sourceDirs) {
            fsExtra.ensureDirSync(`${sourceDir}/source`);
        }
    });
    afterEach(() => {
        fsExtra.removeSync(tmpDir);
    });
    describe('getSourceLocation', () => {

        it('prevents infinite loop with circular dependency', async () => {
            let sourceFilePath = s`${rootDir}/source/main.brs`;
            let stagingFilePath = s`${stagingDir}/source/main.brs`;

            //create sourcemap that points to same file (i.e. circular dependency)
            let codeAndMap = new SourceNode(null, null, sourceFilePath, [
                new SourceNode(1, 0, sourceFilePath, 'sub main()'), '\n',
                new SourceNode(2, 0, sourceFilePath, 'end sub')
            ]).toStringWithSourceMap();

            //create source files
            fsExtra.writeFileSync(sourceFilePath, `sub main()\nend sub`);
            fsExtra.writeFileSync(`${sourceFilePath}.map`, codeAndMap.map.toString());

            //create staging files
            fsExtra.writeFileSync(stagingFilePath, `sub main()\nend sub`);
            fsExtra.writeFileSync(`${stagingFilePath}.map`, codeAndMap.map.toString());

            let location = await locationManager.getSourceLocation({
                stagingFilePath: stagingFilePath,
                stagingFolderPath: stagingDir,
                fileMappings: [],
                rootDir: rootDir,
                lineNumber: 1,
                columnIndex: 0,
                enableSourceMaps: true
            });

            //the fact that we got here means we averted an infinite loop. Make sure it at least gives us the right location too
            expect(location).to.eql({
                filePath: sourceFilePath,
                lineNumber: 1,
                columnIndex: 0
            });

        });

        describe('standard', () => {
            it('simple case, no maps, no breakpoints, no sourceDirs', async () => {
                fsExtra.writeFileSync(`${stagingDir}/lib1.brs`, '');
                fsExtra.writeFileSync(`${rootDir}/lib1.brs`, '');

                let location = await locationManager.getSourceLocation({
                    stagingFilePath: s`${stagingDir}/lib1.brs`,
                    stagingFolderPath: stagingDir,
                    fileMappings: [{
                        src: s`${rootDir}/lib1.brs`,
                        dest: s`${stagingDir}/lib1.brs`
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${rootDir}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });

            it('follows sourcemap when present', async () => {
                await preloadWasm();
                let sourceFilePath = s`${rootDir}/source/main.brs`;
                let stagingFilePath = s`${stagingDir}/source/main.brs`;
                let stagingMapPath = s`${stagingDir}/source/main.brs.map`;
                function n(line: number, col: number, txt: string) {
                    return new SourceNode(line, col, sourceFilePath, txt);
                }

                const node = new SourceNode(null, null, sourceFilePath, [
                    n(1, 0, 'sub'), ' ', n(1, 4, 'main'), n(1, 8, '('), n(1, 9, ')'), '\n',
                    n(2, 0, '    print'), ' ', n(2, 10, '"hello ")'), '\n',
                    n(2, 19, '    print'), ' ', n(2, 30, '"world")'), '\n',
                    n(3, 0, 'end'), ' ', n(3, 4, 'sub')
                ]);
                const out = node.toStringWithSourceMap();

                fsExtra.writeFileSync(sourceFilePath, `sub main()\n    print "hello ":print "world"\nend sub`);
                fsExtra.writeFileSync(stagingFilePath, out.code);
                fsExtra.writeFileSync(stagingMapPath, out.map.toString());

                let location = await locationManager.getSourceLocation({
                    stagingFilePath: stagingFilePath,
                    stagingFolderPath: stagingDir,
                    fileMappings: [],
                    rootDir: rootDir,
                    lineNumber: 3,
                    columnIndex: 0,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: sourceFilePath,
                    lineNumber: 2,
                    columnIndex: 19
                });
            });
        });

        describe('sourceDirs', () => {
            //no maps, sourceDirs[0]
            it('maps staging file to sourceDirs[0]', async () => {
                fsExtra.writeFileSync(`${stagingDir}/lib1.brs`, '');
                fsExtra.writeFileSync(`${rootDir}/lib1.brs`, '');
                fsExtra.writeFileSync(`${sourceDirs[0]}/lib1.brs`, '');
                fsExtra.writeFileSync(`${sourceDirs[1]}/lib1.brs`, '');
                fsExtra.writeFileSync(`${sourceDirs[2]}/lib1.brs`, '');

                let location = await locationManager.getSourceLocation({
                    stagingFilePath: s`${stagingDir}/lib1.brs`,
                    stagingFolderPath: stagingDir,
                    fileMappings: [{
                        src: s`${sourceDirs[0]}/lib1.brs`,
                        dest: '/lib1.brs'
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    sourceDirs: sourceDirs,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${sourceDirs[0]}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });

            //no maps, sourceDirs[1]
            it('maps staging file to sourceDirs[1]', async () => {
                fsExtra.writeFileSync(`${stagingDir}/lib1.brs`, '');
                fsExtra.writeFileSync(`${rootDir}/lib1.brs`, '');
                fsExtra.writeFileSync(`${sourceDirs[1]}/lib1.brs`, '');
                fsExtra.writeFileSync(`${sourceDirs[2]}/lib1.brs`, '');

                let location = await locationManager.getSourceLocation({
                    stagingFilePath: s`${stagingDir}/lib1.brs`,
                    stagingFolderPath: stagingDir,
                    fileMappings: [{
                        src: s`${sourceDirs[1]}/lib1.brs`,
                        dest: '/lib1.brs'
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    sourceDirs: sourceDirs,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${sourceDirs[1]}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });

            //no maps, sourceDirs[2]
            it('maps staging file to sourceDirs[2]', async () => {
                fsExtra.writeFileSync(s`${stagingDir}/lib1.brs`, '');
                fsExtra.writeFileSync(s`${rootDir}/lib1.brs`, '');
                fsExtra.writeFileSync(s`${sourceDirs[2]}/lib1.brs`, '');

                let location = await locationManager.getSourceLocation({
                    stagingFilePath: s`${stagingDir}/lib1.brs`,
                    stagingFolderPath: stagingDir,
                    fileMappings: [{
                        src: s`${sourceDirs[2]}/lib1.brs`,
                        dest: '/lib1.brs'
                    }],
                    rootDir: rootDir,
                    lineNumber: 1,
                    columnIndex: 4,
                    sourceDirs: sourceDirs,
                    enableSourceMaps: true
                });
                expect(location).to.eql({
                    filePath: s`${sourceDirs[2]}/lib1.brs`,
                    lineNumber: 1,
                    columnIndex: 4
                });
            });
        });
    });
});

async function preloadWasm() {
    await SourceMapConsumer.with('{"version":3,"sources":[],"mappings":""}', null, (consumer) => {
        //don't care, just needed it to load the wasm file
    });
}
