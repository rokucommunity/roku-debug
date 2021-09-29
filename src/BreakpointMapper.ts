import type { ProjectManager } from './managers/ProjectManager';
import type { AddBreakpointRequestObject } from './debugProtocol/Debugger';
import type { BreakpointQueue, QueueBreakpoint } from './managers/BreakpointQueue';
import * as fsExtra from 'fs-extra';

export class BreakpointMapper {
    public constructor(
        public queue: BreakpointQueue,
        public projectManager: ProjectManager
    ) {

    }

    private get launchConfig() {
        return this.projectManager.launchConfiguration;
    }

    public async map() {
        this.handleSourceDirs();
        const breakpoints = this.queue.getBreakpoints();
        //a container where all promises will write their results
        const result = [] as AddBreakpointRequestObject[];
        await Promise.all(
            breakpoints.map(x => this.mapBreakpoint(x, result))
        );
        return result;
    }

    /**
     * Move any breakpoints in stagingDir up into sourceDirs
     */
    private handleSourceDirs() {
        const sourceDirs = this.launchConfig?.sourceDirs ?? [];

        if (sourceDirs.length === 0) {
            return;
        }
        const breakpoints = this.queue.getBreakpoints();
        const rootDir = s`${this.launchConfig.rootDir}`;

        for (const breakpoint of breakpoints) {
            let srcPath = breakpoint.srcPath;
            let lastWorkingPath = '';
            for (const sourceDir of sourceDirs) {
                srcPath = srcPath.replace(rootDir, sourceDir);
                if (fsExtra.pathExistsSync(sourceFilePath)) {
                    lastWorkingPath = sourceFilePath;
                }
            }
            sourceFilePath = lastWorkingPath;
        }
    }

    /**
     * Determine the target location for this breakpoint
     */
    private async mapBreakpoint(breakpoint: QueueBreakpoint, result: AddBreakpointRequestObject[]) {

    }
}
