import * as eol from 'eol';
import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import { SourceNode } from 'source-map';
import { DebugProtocol } from 'vscode-debugprotocol';
import { fileUtils } from '../FileUtils';
import { Project } from './ProjectManager';
import { standardizePath as s } from 'roku-deploy';
import { SourceMapManager } from './SourceMapManager';
import { LocationManager } from './LocationManager';
import { util } from '../util';
import { TelnetAdapter } from '../adapters/TelnetAdapter';
import { DebugProtocolAdapter } from '../adapters/DebugProtocolAdapter';

export class BreakpointWriter {

    public constructor(
        private sourceMapManager: SourceMapManager,
        private locationManager: LocationManager
    ) {

    }

    public launchConfiguration: {
        sourceDirs: string[],
        rootDir: string;
        enableSourceMaps?: boolean
    };

    public supportConditionalBreakpoints: boolean = true;
    public supportHitConditionalBreakpoints: boolean = true;
    public supportLogPoints: boolean = true;
    public supportNormalBreakpoints: boolean = true;
    /**
     * Tell the breakpoint manager that no new breakpoints can be verified
     * (most likely due to the app being launched and roku not supporting dynamic breakpoints)
     */
    public lockBreakpoints() {
        this.areBreakpointsLocked = true;
    }

    /**
     * Indicates whether the app has been launched or not.
     * This will determine whether the breakpoints should be written to the files, or marked as not verified (greyed out in vscode)
     */
    private areBreakpointsLocked = false;

    private breakpointsQueue: {
        [refId: string]: {
            response: DebugProtocol.SetBreakpointsResponse,
            args: DebugProtocol.SetBreakpointsArguments
        }
    } = {};

    /**
     * A map of breakpoints by what file they were set in.
     * This does not handle any source-to-dest mapping...these breakpoints are stored in the file they were set in.
     * These breakpoints are all set before launch, and then this list is not changed again after that.
     * (this concept may need to be modified once we get live breakpoint support)
     */
    private breakpointsByFilePath = {} as { [sourceFilePath: string]: AugmentedSourceBreakpoint[] };

    public static breakpointIdSequence = 1;
    /**
     * Get a list of all breakpoint tasks that should be performed.
     * This will also exclude files with breakpoints that are not in scope.
     */
    private async getBreakpointWork(project: Project) {
        let result = {} as {
            [stagingFilePath: string]: Array<BreakpointWorkItem>
        };

        //iterate over every file that contains breakpoints
        for (let sourceFilePath in this.breakpointsByFilePath) {
            let breakpoints = this.breakpointsByFilePath[sourceFilePath];

            for (let breakpoint of breakpoints) {
                //get the list of locations in staging that this breakpoint should be written to.
                //if none are found, then this breakpoint is ignored
                let stagingLocationsResult = await this.locationManager.getStagingLocations(
                    sourceFilePath,
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
                        //add additional info
                        sourceFilePath: sourceFilePath,
                        rootDirFilePath: s`${project.rootDir}/${relativeStagingPath}`,
                        line: stagingLocation.lineNumber,
                        column: stagingLocation.columnIndex,
                        stagingFilePath: stagingLocation.filePath,
                        type: stagingLocationsResult.type
                    };
                    if (!result[stagingLocation.filePath]) {
                        result[stagingLocation.filePath] = [];
                    }
                    result[stagingLocation.filePath].push(obj);
                }
            }
        }
        //sort every breakpoint by location
        for (let stagingFilePath in result) {
            result[stagingFilePath] = this.sortAndRemoveDuplicateBreakpoints(result[stagingFilePath]);
        }

        return result;
    }

    public sortAndRemoveDuplicateBreakpoints<T extends { line: number; column?: number; }>(
        breakpoints: Array<T>
    ) {
        breakpoints = orderBy(breakpoints, [x => x.line, x => x.column]);
        //throw out any duplicate breakpoints (walk backwards so this is easier)
        for (let i = breakpoints.length - 1; i >= 0; i--) {
            let breakpoint = breakpoints[i];
            let higherBreakpoint = breakpoints[i + 1];
            //only support one breakpoint per line
            if (higherBreakpoint && higherBreakpoint.line === breakpoint.line) {
                //throw out the higher breakpoint because it's probably the user-defined breakpoint
                breakpoints.splice(i + 1, 1);
            }
        }
        return breakpoints;
    }

    /**
     * Write "stop" lines into source code for each breakpoint of each file in the given project
     */
    public async writeBreakpointsForProject(project: Project) {
        var breakpointsByStagingFilePath = await this.getBreakpointWork(project);

        let promises = [] as Promise<any>[];
        for (let stagingFilePath in breakpointsByStagingFilePath) {
            promises.push(this.writeBreakpointsToFile(stagingFilePath, breakpointsByStagingFilePath[stagingFilePath]));
        }

        await Promise.all(promises);
    }

    /**
     * Write breakpoints to the specified file, and update the sourcemaps to match
     */
    private async writeBreakpointsToFile(stagingFilePath: string, breakpoints: BreakpointWorkItem[]) {

        //do not crash if the file doesn't exist
        if (!await fsExtra.pathExists(stagingFilePath)) {
            util.log(`Path not found ${stagingFilePath}`);
            return;
        }

        //load the file as a string
        let fileContents = (await fsExtra.readFile(stagingFilePath)).toString();

        let originalFilePath = breakpoints[0].type === 'sourceMap' ?
            //the calling function will merge this sourcemap into the other existing sourcemap, so just use the same name because it doesn't matter
            breakpoints[0].rootDirFilePath :
            //the calling function doesn't have a sourcemap for this file, so we need to point it to the sourceDirs found location (probably rootDir...)
            breakpoints[0].sourceFilePath;

        let sourceAndMap = this.getSourceAndMapWithBreakpoints(fileContents, originalFilePath, breakpoints);

        //if we got a map file back, write it to the filesystem
        if (sourceAndMap.map) {
            let sourceMap = JSON.stringify(sourceAndMap.map);
            //It's ok to overwrite the file in staging because if the original code provided a source map,
            //then our LocationManager class will walk the sourcemap chain from staging, to rootDir, and then
            //on to the original location
            await fsExtra.writeFile(`${stagingFilePath}.map`, sourceMap);
            //update the in-memory version of this source map
            this.sourceMapManager.set(`${stagingFilePath}.map`, sourceMap);
        }

        //overwrite the file that now has breakpoints injected
        await fsExtra.writeFile(stagingFilePath, sourceAndMap.code);
    }

    private bpIndex = 1;
    public getSourceAndMapWithBreakpoints(fileContents: string, originalFilePath: string, breakpoints: BreakpointWorkItem[]) {
        let chunks = [] as Array<SourceNode | string>;

        //split the file by newline
        let lines = eol.split(fileContents);
        let newline = '\n';
        for (let originalLineIndex = 0; originalLineIndex < lines.length; originalLineIndex++) {
            let line = lines[originalLineIndex];
            //if is final line
            if (originalLineIndex === lines.length - 1) {
                newline = '';
            }
            //find breakpoints for this line (breakpoint lines are 1-indexed, but our lineIndex is 0-based)
            let lineBreakpoints = breakpoints.filter(bp => bp.line - 1 === originalLineIndex);
            //if we have a breakpoint, insert that before the line
            for (let bp of lineBreakpoints) {
                let linesForBreakpoint = this.getBreakpointLines(bp, originalFilePath);

                //separate each line for this breakpoint with a newline
                for (let bpLine of linesForBreakpoint) {
                    chunks.push(bpLine);
                    chunks.push('\n');
                }
            }

            //add the original code now
            chunks.push(
                //sourceNode expects 1-based row indexes
                new SourceNode(originalLineIndex + 1, 0, originalFilePath, `${line}${newline}`)
            );
        }

        let node = new SourceNode(null, null, originalFilePath, chunks);

        //if sourcemaps are disabled, skip sourcemap generation and only generate the code
        if (this.launchConfiguration?.enableSourceMaps === false) {
            return {
                code: node.toString(),
                map: undefined
            };
        } else {
            return node.toStringWithSourceMap();
        }
    }

    private getBreakpointLines(breakpoint: BreakpointWorkItem, originalFilePath: string) {
        let lines = [];
        if (breakpoint.logMessage && this.supportLogPoints) {
            let logMessage = breakpoint.logMessage;
            //wrap the log message in quotes
            logMessage = `"${logMessage}"`;
            let expressionsCheck = /\{(.*?)\}/g;
            let match;

            // Get all the value to evaluate as expressions
            while (match = expressionsCheck.exec(logMessage)) {
                logMessage = logMessage.replace(match[0], `"; ${match[1]};"`);
            }

            // add a PRINT statement right before this line with the formated log message
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, `PRINT ${logMessage}`));
        } else if (breakpoint.condition && this.supportConditionalBreakpoints) {
            // add a conditional STOP statement
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, `if ${breakpoint.condition} then : STOP : end if`));
        } else if (breakpoint.hitCondition && this.supportHitConditionalBreakpoints) {
            let hitCondition = parseInt(breakpoint.hitCondition);

            if (isNaN(hitCondition) || hitCondition === 0) {
                // add a STOP statement right before this line
                lines.push(`STOP`);
            } else {
                let prefix = `m.vscode_bp`;
                let bpName = `bp${this.bpIndex++}`;
                let checkHits = `if ${prefix}.${bpName} >= ${hitCondition} then STOP`;
                let increment = `${prefix}.${bpName} ++`;

                // Create the BrightScript code required to track the number of executions
                let trackingExpression = `
                    if Invalid = ${prefix} OR Invalid = ${prefix}.${bpName} then
                        if Invalid = ${prefix} then
                            ${prefix} = {${bpName}: 0}
                        else
                            ${prefix}.${bpName} = 0
                    else
                        ${increment} : ${checkHits}
                `;
                //coerce the expression into single-line
                trackingExpression = trackingExpression.replace(/\n/gi, '').replace(/\s+/g, ' ').trim();
                // Add the tracking expression right before this line
                lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, trackingExpression));
            }
        } else if (this.supportNormalBreakpoints) {
            // add a STOP statement right before this line. Map the stop code to the line the breakpoint represents
            //because otherwise source-map will return null for this location
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, 'STOP'));
        }
        return lines;
    }
}

interface AugmentedSourceBreakpoint extends DebugProtocol.SourceBreakpoint {
    /**
     * An ID for this breakpoint, which is used to set/unset breakpoints in the client
     */
    id: number;
    /**
     * Was this breakpoint added before launch? That means this breakpoint was written into the source code as a `stop` statement,
     * so if users toggle this breakpoint line on and off, it should get verified every time.
     */
    wasAddedBeforeLaunch: boolean;
    /**
     * This breakpoint has been verified (i.e. we were able to set it at the given location)
     */
    verified: boolean;
    /**
     * Since breakpoints are written into the source code, we can't delete the `wasAddedBeforeLaunch` breakpoints,
     * otherwise the non-sourcemap debugging process's line offsets could get messed up. So, for the `wasAddedBeforeLaunch`
     * breakpoints, we need to mark them as hidden when the user unsets them.
     */
    isHidden: boolean;
}

interface BreakpointWorkItem {
    sourceFilePath: string;
    stagingFilePath: string;
    rootDirFilePath: string;
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
    type: 'sourceMap' | 'fileMap' | 'sourceDirs';
}
