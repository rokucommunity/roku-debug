import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { standardizePath as s } from '../FileUtils';
import { SourceMapManager } from './SourceMapManager';
let tmpPath = s`${process.cwd()}/.tmp`;
describe('SourceMapManager', () => {
    let manager: SourceMapManager;

    beforeEach(() => {
        fsExtra.emptyDirSync(tmpPath);
        fsExtra.ensureDirSync(tmpPath);
        manager = new SourceMapManager();
    });
    afterEach(() => {
        fsExtra.removeSync(tmpPath);
    });

    it('constructs', () => {
        expect(manager).to.exist;
    });

    describe('set', () => {
        it('resolves sources relative to the map file directory when no sourceRoot', () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            manager.set(mapPath, JSON.stringify({
                version: 3,
                sources: ['../../src/components/foo.brs'],
                mappings: ''
            }));
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached.sources[0]).to.equal(s`${tmpPath}/src/components/foo.brs`);
        });

        it('resolves sources using an absolute sourceRoot', () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            const absoluteSourceRoot = s`${tmpPath}/src`;
            manager.set(mapPath, JSON.stringify({
                version: 3,
                sourceRoot: absoluteSourceRoot,
                sources: ['components/foo.brs'],
                mappings: ''
            }));
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached.sources[0]).to.equal(s`${tmpPath}/src/components/foo.brs`);
        });

        it('resolves sources using a relative sourceRoot (the bug fix)', () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            manager.set(mapPath, JSON.stringify({
                version: 3,
                sourceRoot: '../../src',
                sources: ['components/foo.brs'],
                mappings: ''
            }));
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached.sources[0]).to.equal(s`${tmpPath}/src/components/foo.brs`);
        });

        it('clears sourceRoot after resolving sources to prevent double-application', () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            manager.set(mapPath, JSON.stringify({
                version: 3,
                sourceRoot: '../../src',
                sources: ['components/foo.brs'],
                mappings: ''
            }));
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached.sourceRoot).to.equal('');
        });

        it('resolves staging-relative sources correctly after fixSourceMapSources rewrites the map', () => {
            // Simulates the end-to-end scenario:
            // 1. Original map at originalMapPath had sources relative to its location
            // 2. fixSourceMapSources() rewrote those sources to be relative to stagingMapPath
            // 3. SourceMapManager.set() is called with the staging path and rewritten contents
            //
            // Structure:
            //   original source:  tmpPath/rootDir/source/main.bs
            //   original map:     tmpPath/srcDir/source/main.brs.map  (sources: ['../../rootDir/source/main.bs'])
            //   staging map:      tmpPath/staging/source/main.brs.map (sources rewritten by fixSourceMapSources)
            //
            // fixSourceMapSources resolves the original relative source to an absolute path, then makes it
            // relative from the staging map dir: path.relative(staging/source/, rootDir/source/main.bs)

            const stagingMapDir = s`${tmpPath}/staging/source`;
            const originalSource = s`${tmpPath}/rootDir/source/main.bs`;

            // Compute the rewritten relative path (what fixSourceMapSources would produce)
            const rewrittenRelative = path.relative(stagingMapDir, originalSource);

            const stagingMapPath = s`${stagingMapDir}/main.brs.map`;
            manager.set(stagingMapPath, JSON.stringify({
                version: 3,
                sources: [rewrittenRelative],
                mappings: ''
            }));

            const cached = (manager as any).cache[s`${stagingMapPath.toLowerCase()}`];
            expect(cached.sources[0]).to.equal(s`${originalSource}`);
        });

        it('handles multiple sources', () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            manager.set(mapPath, JSON.stringify({
                version: 3,
                sources: ['../../src/a.brs', '../../src/b.brs'],
                mappings: ''
            }));
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached.sources[0]).to.equal(s`${tmpPath}/src/a.brs`);
            expect(cached.sources[1]).to.equal(s`${tmpPath}/src/b.brs`);
        });

        it('handles an empty sources array without crashing', () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            manager.set(mapPath, JSON.stringify({
                version: 3,
                sources: [],
                mappings: ''
            }));
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached.sources).to.deep.equal([]);
        });

        it('stores null in cache when given invalid JSON', () => {
            const mapPath = s`${tmpPath}/pkg/foo.brs.map`;
            expect(() => manager.set(mapPath, 'not-json')).to.throw();
            const cached = (manager as any).cache[s`${mapPath.toLowerCase()}`];
            expect(cached).to.be.null;
        });
    });

    describe('getSourceMap', () => {
        it('reads and caches a map file from disk with relative sources', async () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            fsExtra.ensureDirSync(path.dirname(mapPath));
            fsExtra.writeJsonSync(mapPath, {
                version: 3,
                sources: ['../../src/components/foo.brs'],
                mappings: ''
            });
            const result = await manager.getSourceMap(mapPath);
            expect(result.sources[0]).to.equal(s`${tmpPath}/src/components/foo.brs`);
        });

        it('reads and caches a map file from disk with a relative sourceRoot', async () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            fsExtra.ensureDirSync(path.dirname(mapPath));
            fsExtra.writeJsonSync(mapPath, {
                version: 3,
                sourceRoot: '../../src',
                sources: ['components/foo.brs'],
                mappings: ''
            });
            const result = await manager.getSourceMap(mapPath);
            expect(result.sources[0]).to.equal(s`${tmpPath}/src/components/foo.brs`);
            // sourceRoot must be cleared so SourceMapConsumer doesn't double-apply it
            expect(result.sourceRoot).to.equal('');
        });

        it('returns null for a non-existent map file', async () => {
            const result = await manager.getSourceMap(s`${tmpPath}/nonexistent.brs.map`);
            expect(result).to.be.null;
        });

        it('returns the cached result on second call without re-reading disk', async () => {
            const mapPath = s`${tmpPath}/pkg/components/foo.brs.map`;
            fsExtra.ensureDirSync(path.dirname(mapPath));
            fsExtra.writeJsonSync(mapPath, {
                version: 3,
                sources: ['../../src/components/foo.brs'],
                mappings: ''
            });
            const first = await manager.getSourceMap(mapPath);
            // Overwrite on disk — cache should still return the original
            fsExtra.writeJsonSync(mapPath, { version: 3, sources: ['changed.brs'], mappings: '' });
            const second = await manager.getSourceMap(mapPath);
            expect(second).to.equal(first);
        });
    });

    describe('getOriginalLocation', () => {
        it('resolves location using a map with a relative sourceRoot', async () => {
            // staging/components/foo.brs maps back to src/components/foo.brs
            const brsPath = s`${tmpPath}/staging/components/foo.brs`;
            const mapPath = `${brsPath}.map`;
            fsExtra.ensureDirSync(path.dirname(mapPath));

            // Build a minimal source map: line 1 col 0 of foo.brs -> line 5 col 0 of original
            const { SourceMapGenerator } = await import('source-map');
            const gen = new SourceMapGenerator({ file: 'foo.brs', sourceRoot: '../../src' });
            gen.addMapping({
                generated: { line: 1, column: 0 },
                original: { line: 5, column: 0 },
                source: 'components/foo.brs'
            });
            fsExtra.writeFileSync(mapPath, gen.toString());

            const location = await manager.getOriginalLocation(brsPath, 1, 0);
            // sourceRoot '../../src' relative to staging/components/ resolves to src/
            expect(location.filePath).to.equal(s`${tmpPath}/src/components/foo.brs`);
            expect(location.lineNumber).to.equal(5);
        });

        it('returns undefined when no source map exists', async () => {
            const brsPath = s`${tmpPath}/staging/main.brs`;
            const location = await manager.getOriginalLocation(brsPath, 1, 0);
            expect(location).to.be.undefined;
        });
    });
});
