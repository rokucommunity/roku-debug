import * as fsExtra from 'fs-extra';
import { standardizePath as s } from '../FileUtils';
import { SourceNode, SourceMapConsumer } from 'source-map';
import { expect } from 'chai';
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
        const mgr = new SourceMapManager();
    });
});
