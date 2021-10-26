import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import * as sinonActual from 'sinon';

import { SourceNode } from 'source-map';
import { fileUtils, standardizePath as s } from './FileUtils';
import { SourceMapManager } from './managers/SourceMapManager';

let sinon = sinonActual.createSandbox();
const rootDir = path.normalize(path.dirname(__dirname));

describe('FileUtils', () => {
    let sourceMapManager: SourceMapManager;
    beforeEach(() => {
        sourceMapManager = new SourceMapManager();
    });
    afterEach(() => {
        sinon.restore();
    });

    describe('getAllRelativePaths', () => {
        //basic test to get code coverage...we don't need to test the glob code too much here...
        it('works', async () => {
            let paths = await fileUtils.getAllRelativePaths(s`${__dirname}/../src/`);
            expect(
                paths
            ).to.contain(`index.ts`);
        });
    });

    describe('removeFileTruncation', () => {
        it('does not replace when the `...` character is missing', () => {
            expect(fileUtils.removeFileTruncation('project1/main.brs')).to.equal('project1/main.brs');
        });

        it('removes leading ... when present', () => {
            expect(fileUtils.removeFileTruncation('...project1/main.brs')).to.equal('project1/main.brs');
        });
    });

    describe('pathEndsWith', () => {
        it('accepts same path', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs', 'project1/main.brs')).to.be.true;
        });

        it('rejects contained path not found at end', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs.map', 'project1/main.brs')).to.be.false;
        });

        it('rejects non-similar path', () => {
            expect(fileUtils.pathEndsWith('project1/main.brs.map', 'project2/lib.brs')).to.be.false;
        });
    });

    describe('findPartialFileInDirectory', () => {
        beforeEach(() => {
            sinon.stub(fileUtils, 'getAllRelativePaths').returns(Promise.resolve([
                'source/main.brs',
                'source/lib1/lib.brs',
                'source/lib2/lib.brs'
            ]));
        });

        it('normalizes the paths', async () => {
            let filePath = fileUtils.standardizePath(
                await fileUtils.findPartialFileInDirectory('...ource\\lib2//lib.brs', 'NOT_IMPORTANT_DUE_TO_MOCK')
            );
            expect(filePath).to.equal(s`source/lib2/lib.brs`);
        });

        it('returns first result when multiple matches are found', async () => {
            let stub = sinon.stub(console, 'warn').returns(undefined);

            expect(await fileUtils.findPartialFileInDirectory('...lib.brs', 'SomeAppDir')).to.equal('source/lib1/lib.brs');

            //a warning should be logged to the console about the fact that there are multiple matches
            expect(stub.getCalls()).to.be.lengthOf(1);
        });

        it('returns undefined when no results found', async () => {
            expect(await fileUtils.findPartialFileInDirectory('...promise.brs', 'SomeAppDir')).to.be.undefined;
        });
    });

    describe('getComponentLibraryIndex', () => {
        it('finds the index', () => {
            expect(fileUtils.getComponentLibraryIndexFromFileName('pkg:/source/main__lib0.brs', '__lib')).to.equal(0);
            expect(fileUtils.getComponentLibraryIndexFromFileName('pkg:/source/main__lib1.brs', '__lib')).to.equal(1);
            expect(fileUtils.getComponentLibraryIndexFromFileName('pkg:/source/main__lib12.brs', '__lib')).to.equal(12);
        });
        it('returns undefined no number was found', () => {
            expect(fileUtils.getComponentLibraryIndexFromFileName('pkg:/source/main__lib.brs', '__lib')).to.be.undefined;
        });
        it('returns undefined no postfix was found', () => {
            expect(fileUtils.getComponentLibraryIndexFromFileName('pkg:/source/main__notlib1.brs', '__lib')).to.be.undefined;
        });
        it('returns undefined when item after postfix is not a number', () => {
            expect(fileUtils.getComponentLibraryIndexFromFileName('pkg:/source/main__libcat.brs', '__lib')).to.be.undefined;
        });
    });

    describe('findFirstRelativeFile', () => {
        let paths = [] as string[];
        let rootA = s`${rootDir}/compLibA`;
        let rootB = s`${rootDir}/compLibB`;
        let rootC = s`${rootDir}/compLibC`;
        let pathA = path.join(rootA, 'main.brs');
        let pathB = path.join(rootB, 'main.brs');
        let pathC = path.join(rootC, 'main.brs');

        beforeEach(() => {
            sinon.stub(fsExtra, 'pathExists').callsFake((filePath: string) => {
                return paths.includes(filePath);
            });
        });

        it('finds file from first folder', async () => {
            paths = [pathA, pathB, pathC];
            expect(await fileUtils.findFirstRelativeFile('main.brs', [rootA, rootB, rootC])).to.equal(pathA);
        });

        it('finds file from middle folder', async () => {
            paths = [pathB, pathC];
            expect(await fileUtils.findFirstRelativeFile('main.brs', [rootA, rootB, rootC])).to.equal(pathB);
        });

        it('finds file from last folder', async () => {
            paths = [pathC];
            expect(await fileUtils.findFirstRelativeFile('main.brs', [rootA, rootB, rootC])).to.equal(pathC);
        });
    });

    describe('getSourceLocationFromSourceMap', () => {
        let tempDirPath = s`${rootDir}/.test_temp`;
        let sourceDirPath = s`${tempDirPath}/source`;
        let outDirPath = s`${tempDirPath}/out`;
        let sourceFilePath = s`${sourceDirPath}/file.brs`;
        let outFilePath = s`${outDirPath}/file.brs`;
        let outFileMapPath = s`${outFilePath}.map`;

        beforeEach(() => {
            fsExtra.removeSync(tempDirPath);

            fsExtra.ensureDirSync(tempDirPath);
            fsExtra.ensureDirSync(sourceDirPath);
            fsExtra.ensureDirSync(outDirPath);

            let sourceContents = `function main()\n    print "hello"\n    print "world"\nend function
            `;

            //create a source file
            fsExtra.outputFileSync(sourceFilePath, sourceContents);
        });

        afterEach(() => {
            fsExtra.removeSync(tempDirPath);
        });

        async function createOutFiles(sourcePath: string) {
            //transform the file (by adding extra newlines
            let result = new SourceNode(null, null, sourcePath, [
                new SourceNode(1, 0, sourcePath, 'function main()\n'),
                '\n',
                new SourceNode(2, 0, sourcePath, '    print "hello"\n'),
                '\n',
                new SourceNode(3, 0, sourcePath, '    print "world"\n'),
                '\n',
                new SourceNode(4, 0, sourcePath, 'end function\n')
            ]).toStringWithSourceMap();
            await fsExtra.writeFile(outFilePath, result.code);
            await fsExtra.writeFile(outFileMapPath, result.map.toString());
        }

        it('supports absolute paths in source map', async () => {
            await createOutFiles(sourceFilePath);
            let location = await sourceMapManager.getOriginalLocation(outFilePath, 3);
            expect(location).to.eql({
                filePath: sourceFilePath,
                lineNumber: 2,
                columnIndex: 0
            });
        });

        it('supports relative paths in source map', async () => {
            await createOutFiles('../source/file.brs');
            let location = await sourceMapManager.getOriginalLocation(outFilePath, 3);
            expect(location).to.eql({
                filePath: sourceFilePath,
                lineNumber: 2,
                columnIndex: 0
            });
        });
    });

    describe('standardizePath', () => {
        it('forces drive letters to lower case', () => {
            expect(fileUtils.standardizePath(`C:${path.sep}projects`)).to.equal(`c:${path.sep}projects`);
        });

        it('standardizes path separators', () => {
            expect(fileUtils.standardizePath('/a\\b//c\\d')).to.equal(`${path.sep}a${path.sep}b${path.sep}c${path.sep}d`);
        });
    });

    describe('findFirstParent', () => {
        it('finds parent from first index', () => {
            expect(
                fileUtils.standardizePath(
                    fileUtils.findFirstParent(`${rootDir}/project/source/main.brs`, [`${rootDir}/project`])
                )
            ).to.equal(
                s`${rootDir}/project`
            );
        });

        it('finds parent from first index even though the second one would match too', () => {
            expect(
                fileUtils.standardizePath(
                    fileUtils.findFirstParent(`${rootDir}/project/source/main.brs`, [`${rootDir}/project`, `${rootDir}`])
                )
            ).to.equal(
                s`${rootDir}/project`
            );
        });
    });

    describe('standardizePath', () => {
        it('works with string literals', () => {
            expect(s`a${1}b${2}c`).to.equal('a1b2c');
            expect(s`a${1}b${2}`).to.equal('a1b2');
        });
    });

    describe('removeLeadingSlash', () => {
        it('removes the leading slash', () => {
            expect(fileUtils.removeLeadingSlash('/a')).to.equal('a');
        });

        it('removes more than one leading slash', () => {
            expect(fileUtils.removeLeadingSlash('//a')).to.equal('a');
            expect(fileUtils.removeLeadingSlash('///a')).to.equal('a');
        });

        it('returns the original text when no leading slash is found', () => {
            expect(fileUtils.removeLeadingSlash('a')).to.equal('a');
        });
    });

    describe('removeTrailingSlash', () => {
        it('removes the leading slash', () => {
            expect(fileUtils.removeTrailingSlash('a/')).to.equal('a');
        });

        it('removes more than one leading slash', () => {
            expect(fileUtils.removeTrailingSlash('a//')).to.equal('a');
            expect(fileUtils.removeTrailingSlash('a///')).to.equal('a');
        });

        it('returns the original text when no leading slash is found', () => {
            expect(fileUtils.removeTrailingSlash('a')).to.equal('a');
        });
    });
});
