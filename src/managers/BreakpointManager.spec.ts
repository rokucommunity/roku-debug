// tslint:disable:no-unused-expression
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import { SourceMapConsumer, SourceNode } from 'source-map';

import { BreakpointManager } from './BreakpointManager';
import { fileUtils } from '../FileUtils';
let n = fileUtils.standardizePath.bind(fileUtils);
import { standardizePath as s } from '../FileUtils';
import { LocationManager } from '../managers/LocationManager';
import { SourceMapManager } from './SourceMapManager';

describe('BreakpointManager', () => {
    let cwd = fileUtils.standardizePath(process.cwd());

    let tmpDir = s`${cwd}/.tmp`;
    let rootDir = s`${tmpDir}/rootDir`;
    let stagingDir = s`${tmpDir}/stagingDir`;
    let distDir = s`${tmpDir}/dist`;
    let srcDir = s`${tmpDir}/src`;
    let outDir = s`${tmpDir}/out`;

    let bpManager: BreakpointManager;
    let locationManager: LocationManager;
    let sourceMapManager: SourceMapManager;
    //cast the manager as any to simplify some of the tests
    let b: any;
    beforeEach(() => {
        fsExtra.ensureDirSync(tmpDir);
        fsExtra.emptyDirSync(tmpDir);
        fsExtra.ensureDirSync(`${rootDir}/source`);
        fsExtra.ensureDirSync(`${stagingDir}/source`);
        fsExtra.ensureDirSync(`${distDir}/source`);
        fsExtra.ensureDirSync(`${srcDir}/source`);
        fsExtra.ensureDirSync(outDir);

        sourceMapManager = new SourceMapManager();
        locationManager = new LocationManager(sourceMapManager);
        bpManager = new BreakpointManager(sourceMapManager, locationManager);
        b = bpManager;
    });

    afterEach(() => {
        fsExtra.removeSync(tmpDir);
    });

    describe('sanitizeSourceFilePath', () => {
        it('returns the original string when no key was found', () => {
            expect(bpManager.sanitizeSourceFilePath('a/b/c')).to.equal(s`a/b/c`);
        });
        it('returns the the found key when it already exists', () => {
            b.breakpointsByFilePath[s`A/B/C`] = [];
            expect(bpManager.sanitizeSourceFilePath('a/b/c')).to.equal(s`A/B/C`);
        });
    });

    describe('setBreakpointsForFile', () => {
        it('verifies all breakpoints before launch', () => {
            var breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }, {
                line: 1,
                column: 0
            }]);
            expect(breakpoints).to.be.lengthOf(2);
            expect(breakpoints[0]).to.include({
                line: 0,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            });
            expect(breakpoints[1]).to.include({
                line: 1,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true
            });
        });

        it('does not verify breakpoints after launch', () => {
            bpManager.lockBreakpoints();
            let breakpoints = bpManager.replaceBreakpoints(n(`${cwd}/file.brs`), [{
                line: 0,
                column: 0
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 0,
                column: 0,
                verified: false,
                wasAddedBeforeLaunch: false
            });
        });

        it('re-verifies breakpoint after launch toggle', () => {
            //set the breakpoint before launch
            let breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
                line: 2
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: true,
                isHidden: false
            });

            //launch
            bpManager.lockBreakpoints();

            //simulate user deleting all breakpoints
            breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, []);

            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                verified: true,
                isHidden: true
            });

            //simulate user adding a breakpoint to the same place it had been before
            breakpoints = bpManager.replaceBreakpoints(s`${cwd}/file.brs`, [{
                line: 2
            }]);
            expect(breakpoints).to.be.lengthOf(1);
            expect(breakpoints[0]).to.deep.include({
                line: 2,
                column: 0,
                verified: true,
                wasAddedBeforeLaunch: true,
                isHidden: false
            });
        });
    });
});
