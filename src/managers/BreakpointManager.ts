import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import type { CodeWithSourceMap } from 'source-map';
import { SourceNode } from 'source-map';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { fileUtils, standardizePath } from '../FileUtils';
import type { RemoteComponentLibraryProject , Project } from './ProjectManager';
import { standardizePath as s } from 'roku-deploy';
import type { SourceMapManager } from './SourceMapManager';
import type { LocationManager } from './LocationManager';
import { util } from '../util';
import { EventEmitter } from 'eventemitter3';
import { logger, Logger } from '../logging';

export class BreakpointManager {

    public constructor(
        private sourceMapManager: SourceMapManager,
        private locationManager: LocationManager
    ) {

    }

    private logger = logger.createLogger('[bpManager]');

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
     * Get a promise that resolves the next time the specified event occurs
     */
    public once(eventName: 'breakpoints-verified'): Promise<{ breakpoints: AugmentedSourceBreakpoint[] }>;
    public once(eventName: string): Promise<any> {
        return new Promise((resolve) => {
            const disconnect = this.on(eventName as 'breakpoints-verified', (data) => {
                disconnect();
                resolve(data);
            });
        });
    }

    /**
     * A map of breakpoints by what file they were set in.
     * This does not handle any source-to-dest mapping...these breakpoints are stored in the file they were set in.
     * These breakpoints are all set before launch, and then this list is not changed again after that.
     * (this concept may need to be modified once we get live breakpoint support)
     */
    private breakpointsByFilePath = new Map<string, AugmentedSourceBreakpoint[]>();

    /**
     * A list of breakpoints that failed to delete and will be deleted as soon as possible
     */
    public failedDeletions = [] as BreakpointWorkItem[];

    /**
     * A sequence used to generate unique client breakpoint IDs
     */
    private breakpointIdSequence = 1;

    /**
     * breakpoint lines are 1-based, and columns are zero-based
     */
    public setBreakpoint(srcPath: string, breakpoint: AugmentedSourceBreakpoint | DebugProtocol.SourceBreakpoint) {
        this.logger.debug('setBreakpoint', { srcPath, breakpoint });

        srcPath = this.sanitizeSourceFilePath(srcPath);

        this.logger.debug('[setBreakpoint] sanitized srcPath', srcPath);

        //if a breakpoint gets set in rootDir, and we have sourceDirs, convert the rootDir path to sourceDirs path
        //so the breakpoint gets moved into the source file instead of the output file
        if (this.launchConfiguration?.sourceDirs?.length > 0) {
            let lastWorkingPath: string;
            for (const sourceDir of this.launchConfiguration.sourceDirs) {
                srcPath = srcPath.replace(this.launchConfiguration.rootDir, sourceDir);
                if (fsExtra.pathExistsSync(srcPath)) {
                    lastWorkingPath = srcPath;
                }
            }
            //replace srcPath with the highest sourceDir path that exists
            if (lastWorkingPath) {
                srcPath = this.sanitizeSourceFilePath(lastWorkingPath);
            }
        }

        //get the breakpoints array (and optionally initialize it if not set)
        let breakpointsArray = this.getBreakpointsForFile(srcPath, true);

        //only a single breakpoint can be defined per line. So, if we find one on this line, we'll augment that breakpoint rather than building a new one
        const existingBreakpoint = breakpointsArray.find(x => x.line === breakpoint.line && x.column === (breakpoint.column ?? 0));

        this.logger.debug('existingBreakpoint', existingBreakpoint);

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
            srcPath: srcPath
        } as AugmentedSourceBreakpoint);

        //assign a hash-like key to this breakpoint (so we can match against other similar breakpoints in the future)
        // Do this after all props are assigned so we can get a consistent hash
        bp.srcHash = this.getBreakpointSrcHash(srcPath, bp);

        //generate a new id for this breakpoint if one does not exist
        bp.id ??= this.breakpointIdSequence++;

        //all breakpoints default to false if not already set to true
        bp.verified ??= false;

        if (bp.column > 0) {
            bp.message = `Error: inline break points are not supported`;
            bp.reason = 'failed';
        }

        //if the breakpoint hash changed, mark the breakpoint as unverified
        if (existingBreakpoint?.srcHash !== bp.srcHash) {
            bp.verified = false;
        }

        //if this is a new breakpoint, add it to the list. (otherwise, the existing breakpoint is edited in-place)
        if (!existingBreakpoint) {
            breakpointsArray.push(bp);
        }

        //if this is one of the permanent breakpoints, mark it as verified immediately (only applicable to telnet sessions)
        if (this.getPermanentBreakpoint(bp.srcHash)) {
            this.setBreakpointDeviceId(bp.srcHash, bp.srcHash, bp.id);
            this.verifyBreakpoint(bp.id, true);
        }

        this.logger.debug('setBreakpoint done', bp);

        return bp;
    }

    /**
     * Delete a breakpoint
     */
    public deleteBreakpoint(hash: string);
    public deleteBreakpoint(breakpoint: AugmentedSourceBreakpoint);
    public deleteBreakpoint(srcPath: string, breakpoint: Breakpoint);
    public deleteBreakpoint(...args: [string] | [AugmentedSourceBreakpoint] | [string, Breakpoint]) {
        this.deleteBreakpoints([
            this.getBreakpoint(...args as [string])
        ]);
    }

    /**
     * Delete a set of breakpoints
     */
    public deleteBreakpoints(args: BreakpointRef[]) {
        this.logger.debug('deleteBreakpoints', args);

        for (const breakpoint of this.getBreakpoints(args)) {
            const actualBreakpoint = this.getBreakpoint(breakpoint);
            if (actualBreakpoint) {
                const breakpoints = new Set(this.getBreakpointsForFile(actualBreakpoint.srcPath));
                breakpoints.delete(actualBreakpoint);
                this.replaceBreakpoints(actualBreakpoint.srcPath, [...breakpoints]);
            }
        }
    }

    /**
     * Get a breakpoint by providing the data you have available
     */
    public getBreakpoint(hash: BreakpointRef): AugmentedSourceBreakpoint;
    public getBreakpoint(srcPath: string, breakpoint: Breakpoint): AugmentedSourceBreakpoint;
    public getBreakpoint(...args: [BreakpointRef] | [string, Breakpoint]): AugmentedSourceBreakpoint {
        let ref: BreakpointRef;
        if (typeof args[0] === 'string' && typeof args[1] === 'object') {
            ref = this.getBreakpointSrcHash(args[0], args[1]);
        } else {
            ref = args[0];
        }
        return this.getBreakpoints([ref])[0];
    }

    /**
     * Given a breakpoint ref, turn it into a hash
     */
    private refToHash(ref: BreakpointRef): string {
        if (!ref) {
            return;
        }
        //hash
        if (typeof ref === 'string') {
            return ref;
        }
        //object with a .hash key
        if ('srcHash' in ref) {
            return ref.srcHash;
        }
        //breakpoint with srcPath
        if (ref?.srcPath) {
            return this.getBreakpointSrcHash(ref.srcPath, ref);
        }
    }

    /**
     * Get breakpoints by providing a list of breakpoint refs
     * @param refs a list of breakpoint refs for breakpoints to get
     * @param includeHistoric if true, will also look through historic breakpoints for a match.
     */
    public getBreakpoints(refs: BreakpointRef[]): AugmentedSourceBreakpoint[] {
        //convert all refs into a hash
        const refHashes = new Set(refs.map(x => this.refToHash(x)));

        //find all the breakpoints that match one of the specified refs
        return [...this.breakpointsByFilePath].map(x => x[1]).flat().filter((x) => {
            return refHashes.has(x.srcHash);
        });
    }

    private deviceIdByDestHash = new Map<string, { srcHash: string; deviceId: number }>();

    /**
      * Find a breakpoint by its deviceId
      * @returns the breakpoint, or undefined if not found
      */
    private getBreakpointByDeviceId(deviceId: number) {
        const bpRef = [...this.deviceIdByDestHash.values()].find(x => {
            return x.deviceId === deviceId;
        });
        return this.getBreakpoint(bpRef?.srcHash);
    }

    /**
     * Set the deviceId of a breakpoint
     */
    public setBreakpointDeviceId(srcHash: string, destHast: string, deviceId: number) {
        this.logger.debug('setBreakpointDeviceId', { srcHash, destHast, deviceId });
        this.deviceIdByDestHash.set(destHast, { srcHash: srcHash, deviceId: deviceId });
    }

    /**
     * Mark this breakpoint as verified
     */
    public verifyBreakpoint(deviceId: number, isVerified = true) {
        const breakpoint = this.getBreakpointByDeviceId(deviceId);
        if (breakpoint) {
            breakpoint.verified = isVerified;

            this.queueEvent('breakpoints-verified', breakpoint.srcHash);
            return true;
        } else {
            //couldn't find the breakpoint. return false so the caller can handle that properly
            return false;
        }
    }

    private queueEventStates = new Map<string, { pendingRefs: BreakpointRef[]; isQueued: boolean }>();


    /**
     * Queue future events to be fired when data settles. Typically this is data that needs synced back to vscode.
     * This queues up a future function that will emit a batch of all the specified breakpoints.
     * @param hash the breakpoint hash that identifies this specific breakpoint based on its features
     */
    private queueEvent(event: 'breakpoints-verified', ref: BreakpointRef) {
        //get the state (or create a new one)
        const state = this.queueEventStates.get(event) ?? (this.queueEventStates.set(event, { pendingRefs: [], isQueued: false }).get(event));

        this.queueEventStates.set(event, state);
        state.pendingRefs.push(ref);
        if (!state.isQueued) {
            state.isQueued = true;

            process.nextTick(() => {
                state.isQueued = false;
                const breakpoints = this.getBreakpoints(state.pendingRefs);
                state.pendingRefs = [];
                this.emit(event as Parameters<typeof this.emit>[0], {
                    breakpoints: breakpoints
                });
            });
        }
    }

    /**
     * Generate a hash based on the features of the breakpoint. Every breakpoint that exists at the same location
     * and has the same features should have the same hash.
     */
    private getBreakpointSrcHash(filePath: string, breakpoint: DebugProtocol.SourceBreakpoint | AugmentedSourceBreakpoint) {
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
     * Generate a hash based on the features of the breakpoint. Every breakpoint that exists at the same location
     * and has the same features should have the same hash.
     */
    private getBreakpointDestHash(breakpoint: BreakpointWorkItem) {
        const key = `${standardizePath(breakpoint.stagingFilePath)}:${breakpoint.line}:${breakpoint.column ?? 0}`;

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
                if (breakpoint?.reason === 'failed') {
                    // If this breakpoint failed then skip this work item
                    // Can happen due to developers setting breakpoints in the wrong place
                    continue;
                }
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
                    project.stagingDir,
                    project.fileMappings
                );

                for (let stagingLocation of stagingLocationsResult.locations) {
                    let relativeStagingPath = fileUtils.replaceCaseInsensitive(
                        stagingLocation.filePath,
                        fileUtils.standardizePath(
                            fileUtils.removeTrailingSlash(project.stagingDir) + '/'
                        ),
                        ''
                    );
                    const pkgPath = 'pkg:/' + fileUtils
                        //replace staging folder path with nothing (so we can build a pkg path)
                        .replaceCaseInsensitive(
                            s`${stagingLocation.filePath}`,
                            s`${project.stagingDir}`,
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
                        destHash: undefined,
                        rootDirFilePath: s`${project.rootDir}/${relativeStagingPath}`,
                        line: stagingLocation.lineNumber,
                        column: stagingLocation.columnIndex,
                        stagingFilePath: stagingLocation.filePath,
                        type: stagingLocationsResult.type,
                        pkgPath: pkgPath,
                        componentLibraryName: (project as RemoteComponentLibraryProject).name
                    };
                    obj.destHash = this.getBreakpointDestHash(obj);
                    obj.deviceId = this.deviceIdByDestHash.get(obj.destHash)?.deviceId;

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
                this.setBreakpointDeviceId(breakpoint.srcHash, breakpoint.destHash, breakpoint.id);
                this.verifyBreakpoint(breakpoint.id, true);
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
                if (breakpoint.srcHash === hash) {
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
        this.logger.debug('getDiff');

        //if the diff is currently running, return an empty "nothing has changed" diff
        if (this.isGetDiffRunning) {
            this.logger.debug('another diff is already running, exiting early');
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

                    this.logger.debug('[bpmanager] getDiff breakpointWork', work);

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
                            currentState.set(key, { ...bp, deviceId: this.deviceIdByDestHash.get(bp.destHash)?.deviceId });
                        }
                    }
                })
            );

            const added = new Map<string, BreakpointWorkItem>();
            const removed = new Map<string, BreakpointWorkItem>();
            const unchanged = new Map<string, BreakpointWorkItem>();

            this.logger.debug('lastState:', this.lastState);
            this.logger.debug('currentState:', currentState);

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

            const result = {
                added: [...added.values()],
                removed: [...removed.values(), ...this.failedDeletions],
                unchanged: [...unchanged.values()]
            };
            this.failedDeletions = [];
            //hydrate the breakpoints with any available deviceIds
            for (const breakpoint of [...result.added, ...result.removed, ...result.unchanged]) {
                breakpoint.deviceId = this.deviceIdByDestHash.get(breakpoint.destHash)?.deviceId;
            }
            return result;
        } finally {
            this.isGetDiffRunning = false;
        }
    }

    /**
     * Set the pending status of the given list of breakpoints.
     *
     * Whenever the breakpoint is currently being handled by an adapter (i.e. add/update/delete), it should
     * be marked "pending". Then, when the response comes back (success or fail), "pending" should be set to false.
     * In this way, we can ensure that all breakpoints can be synchronized with the device
     */
    public setPending(srcPath: string, breakpoints: Breakpoint[], isPending: boolean) {
        for (const breakpoint of breakpoints) {
            if (breakpoint) {
                const hash = this.getBreakpointSrcHash(srcPath, breakpoint);
                this.breakpointPendingStatus.set(hash, isPending);
            }
        }
    }

    /**
     * Determine whether the current breakpoint is pending or not
     */
    public isPending(srcPath: string, breakpoint: Breakpoint);
    public isPending(hash: string);
    public isPending(...args: [string] | [string, Breakpoint]) {
        let hash: string;
        if (args[1]) {
            hash = this.getBreakpointSrcHash(args[0], args[1]);
        } else {
            hash = args[0];
        }
        return this.breakpointPendingStatus.get(hash) ?? false;
    }

    /**
     * A map of breakpoint hashes, and whether that breakpoint is currently pending or not.
     */
    private breakpointPendingStatus = new Map<string, boolean>();

    /**
     * Flag indicating whether a `getDiff` function is currently running
     */
    private isGetDiffRunning = false;
    private lastState = new Map<string, BreakpointWorkItem>();

    public clearBreakpointLastState() {
        this.lastState.clear();
    }
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
    srcHash: string;
    /**
     * A unique ID the debug adapter generates to help send updates to the client about this breakpoint
     */
    id: number;
    /**
     * This breakpoint has been verified (i.e. we were able to set it at the given location)
     */
    verified: boolean;

    /** A message about the state of the breakpoint.
        This is shown to the user and can be used to explain why a breakpoint could not be verified.
    */
    message?: string;

    /** A machine-readable explanation of why a breakpoint may not be verified. If a breakpoint is verified or a specific reason is not known, the adapter should omit this property. Possible values include:

        - `pending`: Indicates a breakpoint might be verified in the future, but the adapter cannot verify it in the current state.
            - `failed`: Indicates a breakpoint was not able to be verified, and the adapter does not believe it can be verified without intervention.
    */
    reason?: 'pending' | 'failed';
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
    srcHash: string;
    /**
     *
     */
    destHash: string;
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

export type Breakpoint = DebugProtocol.SourceBreakpoint | AugmentedSourceBreakpoint;

/**
 * A way to reference a breakpoint.
 * - `string` - a hash
 * - `AugmentedSourceBreakpoint` an actual breakpoint
 * - `{hash: string}` - an object containing a breakpoint hash
 * - `Breakpoint & {srcPath: string}` - an object with all the properties of a breakpoint _and_ an explicitly defined `srcPath`
 */
export type BreakpointRef = string | AugmentedSourceBreakpoint | { srcHash: string } | (Breakpoint & { srcPath: string });
