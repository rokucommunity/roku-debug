import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { standardizePath as s } from '../FileUtils';
import { SourceMapManager } from './SourceMapManager';
let tmpPath = s`${process.cwd()}/.tmp`;
describe('SourceMapManager', () => {
    beforeEach(() => {
        fsExtra.emptyDirSync(tmpPath);
        fsExtra.ensureDirSync(tmpPath);
    });
    afterEach(() => {
        fsExtra.removeSync(tmpPath);
    });
    it('constructs', () => {
        const manager = new SourceMapManager();
        expect(manager).to.exist;
    });
});
