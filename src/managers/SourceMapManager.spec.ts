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
    });
});
