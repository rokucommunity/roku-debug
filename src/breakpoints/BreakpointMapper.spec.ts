import { BreakpointMapper } from './BreakpointMapper';
import type { SourceBreakpoint } from '../breakpoints/BreakpointQueue';
import { BreakpointQueue } from '../breakpoints/BreakpointQueue';
import { LocationManager } from '../managers/LocationManager';
import { ProjectManager } from '../managers/ProjectManager';
import { SourceMapManager } from '../managers/SourceMapManager';
import { rootDir, sourceDirChild, sourceDirParent, sourceDirs } from '../testHelpers.spec';
import { standardizePath as s } from '../FileUtils';
import * as fsExtra from 'fs-extra';
import { expect } from 'chai';

describe('BreakpointMapper', () => {
    let mapper: BreakpointMapper;
    let projectManager: ProjectManager;
    let queue: BreakpointQueue;
    let locationManager: LocationManager;
    let sourceMapManager: SourceMapManager;

    beforeEach(() => {
        sourceMapManager = new SourceMapManager();
        queue = new BreakpointQueue();
        projectManager = new ProjectManager(queue, locationManager);
        locationManager = new LocationManager(sourceMapManager);
        mapper = new BreakpointMapper(queue, projectManager, locationManager);
    });

    it('does not move breakpoint from rootDir when file missing in sourceDirs', async () => {
        projectManager.launchConfiguration = {
            rootDir: rootDir,
            sourceDirs: sourceDirs
        } as any;
        const rootPath = s`${rootDir}/source/lib.brs`;
        queue.setBreakpoints(rootPath, [bp(1), bp(3)]);

        //root breakpoint should be there before mapping
        expect(hasBreakpoint(rootPath, 1)).to.be.true;
        expect(hasBreakpoint(rootPath, 3)).to.be.true;

        await mapper.map();

        //root breakpoint should be there after  mapping
        expect(hasBreakpoint(rootPath, 1)).to.be.true;
        expect(hasBreakpoint(rootPath, 3)).to.be.true;
    });

    it('moves breakpoints from rootDir into sourceDirs', async () => {
        projectManager.launchConfiguration = {
            rootDir: rootDir,
            sourceDirs: sourceDirs
        } as any;
        const rootPath = s`${rootDir}/source/lib.brs`;
        const childPath = s`${sourceDirChild}/source/lib.brs`;
        const parentPath = s`${sourceDirParent}/source/lib.brs`;
        fsExtra.outputFileSync(childPath, '');
        fsExtra.outputFileSync(parentPath, '');
        queue.setBreakpoints(rootPath, [bp(1), bp(3)]);

        //root breakpoint should be there before mapping
        expect(hasBreakpoint(rootPath, 1)).to.be.true;
        expect(hasBreakpoint(rootPath, 3)).to.be.true;

        await mapper.map();

        //should have moved breakpoint to lowest-most sourcedir
        expect(hasBreakpoint(childPath, 1)).to.be.true;
        expect(hasBreakpoint(childPath, 3)).to.be.true;

        //should NOT have moved breakpoint to not-most-lowest sourcedir
        expect(hasBreakpoint(parentPath, 1)).to.be.false;
        expect(hasBreakpoint(parentPath, 3)).to.be.false;

        //should have removed the rootPath breakpoints
        expect(hasBreakpoint(rootPath, 1)).to.be.false;
        expect(hasBreakpoint(rootPath, 3)).to.be.false;
    });

    function hasBreakpoint(srcPath: string, line: number, column = 0) {
        return queue.getBreakpoints().some(x =>
            s`${x.srcPath}`.toLowerCase() === s`${srcPath}`.toLowerCase() &&
            x.line === line &&
            x.column === column
        );
    }
});
function bp(line: number, column?: number) {
    return {
        line: line,
        column: column ?? 0
    } as SourceBreakpoint;
}
