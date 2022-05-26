import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import type { CodeWithSourceMap } from 'source-map';
import { SourceNode } from 'source-map';
import type { DebugProtocol } from 'vscode-debugprotocol';
import { fileUtils } from '../FileUtils';
import type { Project } from './ProjectManager';
import { standardizePath as s } from 'roku-deploy';
import type { SourceMapManager } from './SourceMapManager';
import type { LocationManager } from './LocationManager';
import { util } from '../util';

export class BreakpointManager {

    public constructor(
        private sourceMapManager: SourceMapManager,
        private locationManager: LocationManager
    ) {

    }

    public launchConfiguration: {
        sourceDirs: string[];
        rootDir: string;
        enableSourceMaps?: boolean;
    };

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

    /**
     * A map of breakpoints by what file they were set in.
     * This does not handle any source-to-dest mapping...these breakpoints are stored in the file they were set in.
     * These breakpoints are all set before launch, and then this list is not changed again after that.
     * (this concept may need to be modified once we get live breakpoint support)
     */
    private breakpointsByFilePath = {} as Record<string, AugmentedSourceBreakpoint[]>;

    public static breakpointIdSequence = 1;

    /**
     * breakpoint lines are 1-based, and columns are zero-based
     */
    public registerBreakpoint(sourceFilePath: string, breakpoint: AugmentedSourceBreakpoint | DebugProtocol.SourceBreakpoint) {
        sourceFilePath = this.sanitizeSourceFilePath(sourceFilePath);
        //get the breakpoints array (and optionally initialize it if not set)
        let breakpointsArray = this.breakpointsByFilePath[sourceFilePath] ?? [];
        this.breakpointsByFilePath[sourceFilePath] = breakpointsArray;

        let existingBreakpoint = breakpointsArray.find(x => x.line === breakpoint.line);

        let bp = <AugmentedSourceBreakpoint>Object.assign(existingBreakpoint || {}, breakpoint);

        //set column=0 if the breakpoint is missing that field
        bp.column = bp.column ?? 0;

        bp.wasAddedBeforeLaunch = bp.wasAddedBeforeLaunch ?? this.areBreakpointsLocked === false;

        //set an id if one does not already exist (used for pushing breakpoints to the client)
        bp.id = bp.id ?? BreakpointManager.breakpointIdSequence++;

        //any breakpoint set in this function is not hidden
        bp.isHidden = false;

        //mark non-supported breakpoint as NOT verified, since we don't support debugging non-brightscript files
        if (!fileUtils.hasAnyExtension(sourceFilePath, ['.brs', '.bs', '.xml'])) {
            bp.verified = false;

            //debug session is not launched yet, all of these breakpoints are treated as verified
        } else if (this.areBreakpointsLocked === false) {
            //confirm that breakpoint is at a valid location. TODO figure out how to determine valid locations...
            bp.verified = true;

            //a debug session is currently running
        } else {
            //TODO use the standard reverse-lookup logic for converting the rootDir or stagingDir paths into sourceDirs

            //if a breakpoint gets set in rootDir, and we have sourceDirs, convert the rootDir path to sourceDirs path
            //so the breakpoint gets moved into the source file instead of the output file
            if (this.launchConfiguration?.sourceDirs && this.launchConfiguration.sourceDirs.length > 0) {
                let lastWorkingPath = '';
                for (const sourceDir of this.launchConfiguration.sourceDirs) {
                    sourceFilePath = sourceFilePath.replace(this.launchConfiguration.rootDir, sourceDir);
                    if (fsExtra.pathExistsSync(sourceFilePath)) {
                        lastWorkingPath = sourceFilePath;
                    }
                }
                sourceFilePath = lastWorkingPath;

            }
            //new breakpoints will be verified=false, but breakpoints that were removed and then added again should be verified=true
            if (breakpointsArray.find(x => x.wasAddedBeforeLaunch && x.line === bp.line)) {
                bp.verified = true;
                bp.wasAddedBeforeLaunch = true;
            } else {
                bp.verified = false;
                bp.wasAddedBeforeLaunch = false;
            }
        }

        //if we already have a breakpoint for this exact line, don't add another one
        if (breakpointsArray.find(x => x.line === breakpoint.line)) {

        } else {
            //add the breakpoint to the list
            breakpointsArray.push(bp);
        }
    }

    /**
     * Set/replace/delete the list of breakpoints for this file.
     * @param sourceFilePath
     * @param allBreakpointsForFile
     */
    public replaceBreakpoints(sourceFilePath: string, allBreakpointsForFile: DebugProtocol.SourceBreakpoint[]): AugmentedSourceBreakpoint[] {
        sourceFilePath = this.sanitizeSourceFilePath(sourceFilePath);

        if (this.areBreakpointsLocked) {
            //keep verified breakpoints, but toss the rest
            this.breakpointsByFilePath[sourceFilePath] = this.getBreakpointsForFile(sourceFilePath)
                .filter(x => x.verified);

            //hide all of the breakpoints (the active ones will be reenabled later in this method)
            for (let bp of this.breakpointsByFilePath[sourceFilePath]) {
                bp.isHidden = true;
            }
        } else {
            //we're not debugging erase all of the breakpoints
            this.breakpointsByFilePath[sourceFilePath] = [];
        }

        for (let breakpoint of allBreakpointsForFile) {
            this.registerBreakpoint(sourceFilePath, breakpoint);
        }

        //get the final list of breakpoints
        return this.getBreakpointsForFile(sourceFilePath);
    }

    /**
     * Get a list of all breakpoint tasks that should be performed.
     * This will also exclude files with breakpoints that are not in scope.
     */
    private async getBreakpointWork(project: Project) {
        let result = {} as Record<string, Array<BreakpointWorkItem>>;

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

    public sortAndRemoveDuplicateBreakpoints<T extends { line: number; column?: number }>(
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
        let breakpointsByStagingFilePath = await this.getBreakpointWork(project);

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

        let originalFilePath = breakpoints[0].type === 'sourceMap'
            //the calling function will merge this sourcemap into the other existing sourcemap, so just use the same name because it doesn't matter
            ? breakpoints[0].rootDirFilePath
            //the calling function doesn't have a sourcemap for this file, so we need to point it to the sourceDirs found location (probably rootDir...)
            : breakpoints[0].sourceFilePath;

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
        let lines = fileContents.split(/\r?\n/g);
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
            } as CodeWithSourceMap;
        } else {
            return node.toStringWithSourceMap();
        }
    }

    private getBreakpointLines(breakpoint: BreakpointWorkItem, originalFilePath: string) {
        let lines = [] as Array<string | SourceNode>;
        if (breakpoint.logMessage) {
            let logMessage = breakpoint.logMessage;
            //wrap the log message in quotes
            logMessage = `"${logMessage}"`;
            let expressionsCheck = /\{(.*?)\}/g;
            let match: RegExpExecArray;

            // Get all the value to evaluate as expressions
            while ((match = expressionsCheck.exec(logMessage))) {
                logMessage = logMessage.replace(match[0], `"; ${match[1]};"`);
            }

            // add a PRINT statement right before this line with the formated log message
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, `PRINT ${logMessage}`));
        } else if (breakpoint.condition) {
            // add a conditional STOP statement
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, `if ${breakpoint.condition} then : STOP : end if`));
        } else if (breakpoint.hitCondition) {
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
        } else {
            // add a STOP statement right before this line. Map the stop code to the line the breakpoint represents
            //because otherwise source-map will return null for this location
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, 'STOP'));
        }
        return lines;
    }

    /**
     * Get the list of breakpoints for the specified file path, or an empty array
     */
    public getBreakpointsForFile(filePath: string): AugmentedSourceBreakpoint[] {
        let key = this.sanitizeSourceFilePath(filePath);
        return this.breakpointsByFilePath[key] ?? [];
    }

    /**
     * File paths can be different casing sometimes,
     * so find the existing key if it exists, or return the file path if it doesn't exist
     */
    public sanitizeSourceFilePath(filePath: string) {
        filePath = fileUtils.standardizePath(filePath);

        for (let key in this.breakpointsByFilePath) {
            if (filePath.toLowerCase() === key.toLowerCase()) {
                return key;
            }
        }
        return filePath;
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
    type: 'fileMap' | 'sourceDirs' | 'sourceMap';
}
