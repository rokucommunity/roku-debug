import type { Project } from '../managers/ProjectManager';
import type { AddBreakpointRequestObject } from '../debugProtocol/Debugger';
import type { BreakpointQueue, QueueBreakpoint } from './BreakpointQueue';
import type { LocationManager } from '../managers/LocationManager';
import { standardizePath as s, fileUtils } from '../FileUtils';

export class BreakpointMapper {
    public constructor(
        public queue: BreakpointQueue,
        public locationManager: LocationManager
    ) {

    }

    public async mapBreakpoints(project: Project) {
        //move rootDir breakpoints into sourceDirs if applicable
        await this.handleSourceDirs(project);

        const breakpoints = this.queue.getBreakpoints();
        //a container where all promises will write their results
        const result = [] as AddBreakpointRequestObject[];
        await Promise.all(
            breakpoints.map(x => this.mapBreakpoint(project, x, result))
        );
        return result;
    }

    /**
     * Move any breakpoints in rootDir up into sourceDirs
     */
    private async handleSourceDirs(project: Project) {
        const sourceDirs = project.sourceDirs ?? [];

        if (sourceDirs.length === 0) {
            return;
        }
        const breakpoints = this.queue.getBreakpoints();
        const rootDir = s`${project.rootDir}`;

        await Promise.all(
            breakpoints.map(async (breakpoint) => {
                const srcPathRelative = fileUtils.replaceCaseInsensitive(breakpoint.srcPath, rootDir, '');
                const srcPathInSourceDir = await fileUtils.findFirstRelativeFile(srcPathRelative, sourceDirs);
                if (srcPathInSourceDir) {
                    //remove this breakpoint
                    this.queue.deleteBreakpoint(breakpoint.srcPath, breakpoint);
                    //add the breakpoint at the new location
                    this.queue.addBreakpoint(srcPathInSourceDir, {
                        ...breakpoint
                    });
                }
            })
        );
    }

    /**
     * Determine the target location for this breakpoint
     */
    private async mapBreakpoint(project: Project, breakpoint: QueueBreakpoint, result: AddBreakpointRequestObject[]) {
        //get the list of locations in staging that this breakpoint should be written to.
        //if none are found, then this breakpoint is ignored
        let stagingLocationsResult = await this.locationManager.getStagingLocations(
            breakpoint.srcPath,
            breakpoint.line,
            breakpoint.column,
            [
                ...project.sourceDirs,
                project.rootDir
            ],
            project.stagingFolderPath,
            project.fileMappings
        );

        for (let stagingLocation of stagingLocationsResult.locations) {
            let relativeStagingPath = fileUtils.replaceCaseInsensitive(
                stagingLocation.filePath,
                fileUtils.standardizePath(
                    fileUtils.removeTrailingSlash(project.stagingFolderPath) + '/'
                ),
                ''
            );
            let obj: BreakpointWorkItem = {
                //add the breakpoint info
                ...breakpoint,
                rootPath: s`${project.rootDir}/${relativeStagingPath}`,
                line: stagingLocation.lineNumber,
                column: stagingLocation.columnIndex,
                stagingPath: stagingLocation.filePath,
                type: stagingLocationsResult.type
            };
            if (!result[stagingLocation.filePath]) {
                result[stagingLocation.filePath] = [];
            }
            result[stagingLocation.filePath].push(obj);
        }
        return result;
    }
}

export interface BreakpointWorkItem {
    /**
     * The path to the file where the breakpoint was originally set
     */
    srcPath: string;
    /**
     * Path to the file in the staging folder
     */
    stagingPath: string;
    /**
     * Path to the file in the rootDir
     */
    rootPath: string;
    /**
     * The 1-based line number
     */
    line: number;
    /**
     * The 0-based column index
     */
    column: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
    /**
     * `sourceMap` means derived from a source map.
     * `fileMap` means derived from the {src;dest} entry used by roku-deploy
     * `sourceDirs` means derived by walking up the `sourceDirs` list until a relative file was found
     */
    type: 'fileMap' | 'sourceDirs' | 'sourceMap';
}
