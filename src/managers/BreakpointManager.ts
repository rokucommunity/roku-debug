import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import type { CodeWithSourceMap } from 'source-map';
import { SourceNode } from 'source-map';
import type { DebugProtocol } from 'vscode-debugprotocol';
import { fileUtils, standardizePath } from '../FileUtils';
import type { ComponentLibraryProject, Project } from './ProjectManager';
import { standardizePath as s } from 'roku-deploy';
import type { SourceMapManager } from './SourceMapManager';
import type { LocationManager } from './LocationManager';
import { util } from '../util';
import { nextTick } from 'process';
import { EventEmitter } from 'eventemitter3';

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

    private emitter = new EventEmitter();

    private emit(eventName: 'breakpoints-verified', data: { breakpoints: AugmentedSourceBreakpoint[] });
    private emit(eventName: string, data: any) {
        this.emitter.emit(eventName, data);
    }

    /**
     * Subscribe to an event
     */
    public on(eventName: 'breakpoints-verified', handler: (data: { breakpoints: AugmentedSourceBreakpoint[] }) => any);
    public on(eventName: string, handler: (data: any) => any) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.off(eventName, handler);
        };
    }

    /**
     * A map of breakpoints by what file they were set in.
     * This does not handle any source-to-dest mapping...these breakpoints are stored in the file they were set in.
     * These breakpoints are all set before launch, and then this list is not changed again after that.
     * (this concept may need to be modified once we get live breakpoint support)
     */
    private breakpointsByFilePath = new Map<string, AugmentedSourceBreakpoint[]>();

    /**
     * A sequence used to generate unique client breakpoint IDs
     */
    private breakpointIdSequence = 1;

    /**
     * breakpoint lines are 1-based, and columns are zero-based
     */
    public setBreakpoint(srcPath: string, breakpoint: AugmentedSourceBreakpoint | DebugProtocol.SourceBreakpoint) {
        srcPath = this.sanitizeSourceFilePath(srcPath);

        //if a breakpoint gets set in rootDir, and we have sourceDirs, convert the rootDir path to sourceDirs path
        //so the breakpoint gets moved into the source file instead of the output file
        if (this.launchConfiguration?.sourceDirs && this.launchConfiguration.sourceDirs.length > 0) {
            let lastWorkingPath = '';
            for (const sourceDir of this.launchConfiguration.sourceDirs) {
                srcPath = srcPath.replace(this.launchConfiguration.rootDir, sourceDir);
                if (fsExtra.pathExistsSync(srcPath)) {
                    lastWorkingPath = srcPath;
                }
            }
            srcPath = this.sanitizeSourceFilePath(lastWorkingPath);
        }

        //get the breakpoints array (and optionally initialize it if not set)
        let breakpointsArray = this.getBreakpointsForFile(srcPath, true);

        //only a single breakpoint can be defined per line. So, if we find one on this line, we'll augment that breakpoint rather than builiding a new one
        const existingBreakpoint = breakpointsArray.find(x => x.line === breakpoint.line);

        let bp = Object.assign(existingBreakpoint ?? {}, {
            //remove common attributes from any existing breakpoint so we don't end up with more info than we need
            ...{
                //default to 0 if the breakpoint is missing `column`
                column: 0,
                condition: undefined,
                hitCondition: undefined,
                logMessage: undefined
            },
            ...breakpoint,
            srcPath: srcPath,
            //assign a hash-like key to this breakpoint (so we can match against other similar breakpoints in the future)
            hash: this.getBreakpointKey(srcPath, breakpoint)
        }) as AugmentedSourceBreakpoint;

        //generate a new id for this breakpoint if one does not exist
        bp.id ??= this.breakpointIdSequence++;

        //all breakpoints default to false if not already set to true
        bp.verified ??= false;

        //if the breakpoint hash changed, mark the breakpoint as unverified
        if (existingBreakpoint?.hash !== bp.hash) {
            bp.verified = false;
        }

        //if this is a new breakpoint, add it to the list. (otherwise, the existing breakpoint is edited in-place)
        if (!existingBreakpoint) {
            breakpointsArray.push(bp);
        }

        //if this is one of the permanent breakpoints, mark it as verified immediately (only applicable to telnet sessions)
        if (this.getPermanentBreakpoint(bp.hash)) {
            this.verifyBreakpoint(bp.hash, bp.id);
        }
        return bp;
    }

    /**
     * Find a breakpoint by its hash
     * @returns the breakpoint, or undefined if not found
     */
    private getBreakpointByHash(hash: string) {
        return this.getBreakpointsByHashes([hash])[0];
    }

    /**
     * Find a list of breakpoints by their hashes
     * @returns the breakpoint, or undefined if not found
     */
    private getBreakpointsByHashes(hashes: string[]) {
        const result = [] as AugmentedSourceBreakpoint[];
        for (const [, breakpoints] of this.breakpointsByFilePath) {
            for (const breakpoint of breakpoints) {
                if (hashes.includes(breakpoint.hash)) {
                    result.push(breakpoint);
                }
            }
        }
        return result;
    }

    /**
     * Mark this breakpoint as verified
     */
    public verifyBreakpoint(hash: string, deviceId: number) {
        const breakpoint = this.getBreakpointByHash(hash);
        if (breakpoint) {
            breakpoint.verified = true;
            breakpoint.deviceId = deviceId;
        }
        this.queueVerifyEvent(hash);
    }

    /**
     * Whenever breakpoints get verified, they need to be synced back to vscode.
     * This queues up a future function that will emit a batch of all verified breakpoints.
     * @param hash the breakpoint hash that identifies this specific breakpoint based on its features
     */
    private queueVerifyEvent(hash: string) {
        this.verifiedBreakpointKeys.push(hash);
        if (!this.isVerifyEventQueued) {
            this.isVerifyEventQueued = true;

            process.nextTick(() => {
                this.isVerifyEventQueued = false;
                const breakpoints = this.getBreakpointsByHashes(
                    this.verifiedBreakpointKeys.map(x => x)
                );
                this.verifiedBreakpointKeys = [];
                this.emit('breakpoints-verified', {
                    breakpoints: breakpoints
                });
            });
        }
    }
    private verifiedBreakpointKeys: string[] = [];
    private isVerifyEventQueued = false;

    /**
     * Generate a key based on the features of the breakpoint. Every breakpoint that exists at the same location
     * and has the same features should have the same key.
     */
    public getBreakpointKey(filePath: string, breakpoint: DebugProtocol.SourceBreakpoint | AugmentedSourceBreakpoint) {
        const key = `${standardizePath(filePath)}:${breakpoint.line}:${breakpoint.column ?? 0}`;

        const condition = breakpoint.condition?.trim();
        if (condition) {
            return `${key}-condition=${condition}`;
        }

        const hitCondition = parseInt(breakpoint.hitCondition?.trim());
        if (!isNaN(hitCondition)) {
            return `${key}-hitCondition=${hitCondition}`;
        }

        if (breakpoint.logMessage) {
            return `${key}-logMessage=${breakpoint.logMessage}`;
        }

        return `${key}-standard`;
    }

    /**
     * Set/replace/delete the list of breakpoints for this file.
     * @param srcPath
     * @param allBreakpointsForFile
     */
    public replaceBreakpoints(srcPath: string, allBreakpointsForFile: DebugProtocol.SourceBreakpoint[]): AugmentedSourceBreakpoint[] {
        srcPath = this.sanitizeSourceFilePath(srcPath);

        const currentBreakpoints = allBreakpointsForFile.map(breakpoint => this.setBreakpoint(srcPath, breakpoint));

        //delete all breakpoints from the file that are not currently in this list
        this.breakpointsByFilePath.set(
            srcPath,
            this.getBreakpointsForFile(srcPath).filter(x => currentBreakpoints.includes(x))
        );

        //get the final list of breakpoints
        return currentBreakpoints;
    }

    /**
     * Get a list of all breakpoint tasks that should be performed.
     * This will also exclude files with breakpoints that are not in scope.
     */
    private async getBreakpointWork(project: Project) {
        let result = {} as Record<string, Array<BreakpointWorkItem>>;

        //iterate over every file that contains breakpoints
        for (let [sourceFilePath, breakpoints] of this.breakpointsByFilePath) {
            for (let breakpoint of breakpoints) {
                //get the list of locations in staging that this breakpoint should be written to.
                //if none are found, then this breakpoint is ignored
                let stagingLocationsResult = await this.locationManager.getStagingLocations(
                    sourceFilePath,
                    breakpoint.line,
                    breakpoint.column,
                    [
                        ...project?.sourceDirs ?? [],
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
                    const pkgPath = 'pkg:/' + fileUtils
                        //replace staging folder path with nothing (so we can build a pkg path)
                        .replaceCaseInsensitive(
                            s`${stagingLocation.filePath}`,
                            s`${project.stagingFolderPath}`,
                            ''
                        )
                        //force to unix path separators
                        .replace(/[\/\\]+/g, '/')
                        //remove leading slash
                        .replace(/^\//, '');

                    let obj: BreakpointWorkItem = {
                        //add the breakpoint info
                        ...breakpoint,
                        //add additional info
                        srcPath: sourceFilePath,
                        rootDirFilePath: s`${project.rootDir}/${relativeStagingPath}`,
                        line: stagingLocation.lineNumber,
                        column: stagingLocation.columnIndex,
                        stagingFilePath: stagingLocation.filePath,
                        type: stagingLocationsResult.type,
                        pkgPath: pkgPath,
                        componentLibraryName: (project as ComponentLibraryProject).name
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
            const breakpoints = breakpointsByStagingFilePath[stagingFilePath];
            promises.push(this.writeBreakpointsToFile(stagingFilePath, breakpoints));
            for (const breakpoint of breakpoints) {
                //mark this breakpoint as verified
                this.verifyBreakpoint(breakpoint.hash, breakpoint.id);
                //add this breakpoint to the list of "permanent" breakpoints
                this.registerPermanentBreakpoint(breakpoint);
            }
        }

        await Promise.all(promises);

        //sort all permanent breakpoints by line and column
        for (const [key, breakpoints] of this.permanentBreakpointsBySrcPath) {
            this.permanentBreakpointsBySrcPath.set(key, orderBy(breakpoints, [x => x.line, x => x.column]));
        }
    }

    private registerPermanentBreakpoint(breakpoint: BreakpointWorkItem) {
        const collection = this.permanentBreakpointsBySrcPath.get(breakpoint.srcPath) ?? [];
        //clone the breakpoint so future updates don't mutate it.
        collection.push({ ...breakpoint });
        this.permanentBreakpointsBySrcPath.set(breakpoint.srcPath, collection);
    }

    /**
     * The list of breakpoints that were permanently written to a file at the start of a debug session. Used for line offset calculations.
     */
    private permanentBreakpointsBySrcPath = new Map<string, BreakpointWorkItem[]>();

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
            : breakpoints[0].srcPath;

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
    private getBreakpointsForFile(filePath: string, registerIfMissing = false): AugmentedSourceBreakpoint[] {
        let key = this.sanitizeSourceFilePath(filePath);
        const result = this.breakpointsByFilePath.get(key) ?? [];
        if (registerIfMissing === true) {
            this.breakpointsByFilePath.set(key, result);
        }
        return result;
    }

    /**
     * Get the permanent breakpoint with the specified hash
     * @returns the breakpoint with the matching hash, or undefined
     */
    public getPermanentBreakpoint(hash: string) {
        for (const [, breakpoints] of this.permanentBreakpointsBySrcPath) {
            for (const breakpoint of breakpoints) {
                if (breakpoint.hash === hash) {
                    return breakpoint;
                }
            }
        }
    }

    /**
     * Get the list of breakpoints that were written to the source file
     */
    public getPermanentBreakpointsForFile(srcPath: string) {
        return this.permanentBreakpointsBySrcPath.get(
            this.sanitizeSourceFilePath(srcPath)
        ) ?? [];
    }

    /**
     * File paths can be different casing sometimes,
     * so find the existing key if it exists, or return the file path if it doesn't exist
     */
    public sanitizeSourceFilePath(filePath: string) {
        filePath = fileUtils.standardizePath(filePath);

        for (let [key] of this.breakpointsByFilePath) {
            if (filePath.toLowerCase() === key.toLowerCase()) {
                return key;
            }
        }
        return filePath;
    }

    /**
     * Determine if there's a breakpoint set at the given staging folder and line.
     * This is not trivial, so only run when absolutely necessary
     * @param projects the list of projects to scan
     * @param pkgPath the path to the file in the staging directory
     * @param line the 0-based line for the breakpoint
     */
    public async lineHasBreakpoint(projects: Project[], pkgPath: string, line: number) {
        const workByProject = (await Promise.all(
            projects.map(project => this.getBreakpointWork(project))
        ));
        for (const projectWork of workByProject) {
            for (let key in projectWork) {
                const work = projectWork[key];
                for (const item of work) {
                    if (item.pkgPath === pkgPath && item.line - 1 === line) {
                        return true;
                    }
                }
            }
        }
    }


    /**
     * Get a diff of all breakpoints that have changed since the last time the diff was retrieved.
     * Sets the new baseline to the current state, so the next diff will be based on this new baseline.
     *
     * All projects should be passed in every time.
     */
    public async getDiff(projects: Project[]): Promise<Diff> {
        //if the diff is currently running, return an empty "nothing has changed" diff
        if (this.isGetDiffRunning) {
            return {
                added: [],
                removed: [],
                unchanged: [...this.lastState.values()]
            };
        }
        try {
            this.isGetDiffRunning = true;

            const currentState = new Map<string, BreakpointWorkItem>();
            await Promise.all(
                projects.map(async (project) => {
                    //get breakpoint data for every project
                    const work = await this.getBreakpointWork(project);
                    for (const filePath in work) {
                        const fileWork = work[filePath];
                        for (const bp of fileWork) {
                            bp.stagingFilePath = fileUtils.postfixFilePath(bp.stagingFilePath, project.postfix, ['.brs']);
                            bp.pkgPath = fileUtils.postfixFilePath(bp.pkgPath, project.postfix, ['.brs']);
                            const key = [
                                bp.stagingFilePath,
                                bp.line,
                                bp.column,
                                bp.condition,
                                bp.hitCondition,
                                bp.logMessage
                            ].join('--');
                            //clone the breakpoint and then add it to the current state
                            currentState.set(key, { ...bp });
                        }
                    }
                })
            );

            const added = new Map<string, BreakpointWorkItem>();
            const removed = new Map<string, BreakpointWorkItem>();
            const unchanged = new Map<string, BreakpointWorkItem>();
            for (const key of [...currentState.keys(), ...this.lastState.keys()]) {
                const inCurrent = currentState.has(key);
                const inLast = this.lastState.has(key);
                //no change
                if (inLast && inCurrent) {
                    unchanged.set(key, currentState.get(key));

                    //added since last time
                } else if (!inLast && inCurrent) {
                    added.set(key, currentState.get(key));

                    //removed since last time
                } else {
                    removed.set(key, this.lastState.get(key));
                }
            }
            this.lastState = currentState;
            return {
                added: [...added.values()],
                removed: [...removed.values()],
                unchanged: [...unchanged.values()]
            };
        } finally {
            this.isGetDiffRunning = false;
        }
    }
    /**
     * Flag indicating whether a `getDiff` function is currently running
     */
    private isGetDiffRunning = false;
    private lastState = new Map<string, BreakpointWorkItem>();
}

export interface Diff {
    added: BreakpointWorkItem[];
    removed: BreakpointWorkItem[];
    unchanged: BreakpointWorkItem[];
}

export interface AugmentedSourceBreakpoint extends DebugProtocol.SourceBreakpoint {
    /**
     * The path to the source file where this breakpoint was originally set
     */
    srcPath: string;
    /**
     * A unique hash generated for the breakpoint at this exact file/line/column/feature. Every breakpoint with these same features should get the same hash
     */
    hash: string;
    /**
     * The device-provided breakpoint id. A missing ID means this breakpoint has not yet been verified by the device.
     */
    deviceId?: number;
    /**
     * A unique ID the debug adapter generates to help send updates to the client about this breakpoint
     */
    id: number;
    /**
     * This breakpoint has been verified (i.e. we were able to set it at the given location)
     */
    verified: boolean;
}

export interface BreakpointWorkItem {
    /**
     * The path to the source file where this breakpoint was originally set
     */
    srcPath: string;
    /**
     * The absolute path to the file in the staging folder
     */
    stagingFilePath: string;
    /**
     * The device path (i.e. `pkg:/source/main.brs`)
     */
    pkgPath: string;
    /**
     * The path to the rootDir for this breakpoint
     */
    rootDirFilePath: string;
    /**
     * The 1-based line number
     */
    line: number;
    /**
     * The device-provided breakpoint id. A missing ID means this breakpoint has not yet been verified by the device.
     */
    deviceId?: number;
    /**
     * An id generated by the debug adapter used to identify this breakpoint in the client
     */
    id: number;
    /**
     * A unique hash generated for the breakpoint at this exact file/line/column/feature. Every breakpoint with these same features should get the same hash
     */
    hash: string;
    /**
     * The 0-based column index
     */
    column: number;
    /**
     * If set, this breakpoint will only activate when this condition evaluates to true
     */
    condition?: string;
    /**
     * If set, this breakpoint will only activate once the breakpoint has been hit this many times.
     */
    hitCondition?: string;
    /**
     * If set, this breakpoint will emit a log message at runtime and will not actually stop at the breakpoint
     */
    logMessage?: string;
    /**
     * The name of the component library this belongs to. Will be null for the main project
     */
    componentLibraryName?: string;
    /**
     * `sourceMap` means derived from a source map.
     * `fileMap` means derived from the {src;dest} entry used by roku-deploy
     * `sourceDirs` means derived by walking up the `sourceDirs` list until a relative file was found
     */
    type: 'fileMap' | 'sourceDirs' | 'sourceMap';
}
