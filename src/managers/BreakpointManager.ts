import * as eol from 'eol';
import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import { SourceNode } from 'source-map';
import { DebugProtocol } from 'vscode-debugprotocol';
import { fileUtils } from '../FileUtils';
import { Project, ComponentLibraryProject } from './ProjectManager';
import { standardizePath as s } from 'roku-deploy';
import { SourceMapManager } from './SourceMapManager';
import { LocationManager } from './LocationManager';
import { util } from '../util';
import { TelnetAdapter } from '../adapters/TelnetAdapter';
import { DebugProtocolAdapter } from '../adapters/DebugProtocolAdapter';
import { Breakpoint } from 'vscode-debugadapter';
import { EventEmitter } from 'events';
import { AddBreakpointRequestObject } from '../debugProtocol/Debugger';

export class BreakpointManager {

    public constructor(
        private sourceMapManager: SourceMapManager,
        private locationManager: LocationManager
    ) {

    }

    public on(eventName: 'changed', handler: (breakpoints: Breakpoint[]) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter?.removeListener(eventName, handler);
        };
    }

    private emitter = new EventEmitter();

    private emit(
        eventName:
            'changed',
        data?
    ) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            if (this.emitter) {
                this.emitter.emit(eventName, data);
            }
        }, 0);
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
        [refId: string]: DebugProtocol.SetBreakpointsArguments
    } = {};

    /**
     * A map of breakpoints by what file they were set in.
     * This does not handle any source-to-dest mapping...these breakpoints are stored in the file they were set in.
     * These breakpoints are all set before launch, and then this list is not changed again after that.
     * (this concept may need to be modified once we get live breakpoint support)
     */
    private breakpointsByFilePath = {} as { [sourceFilePath: string]: AugmentedSourceBreakpoint[] };

    private breakpointRefIds: { [refId: string]: number } = {};

    public queueBreakpointsForFile(args: DebugProtocol.SetBreakpointsArguments) {
        let sanitizedPath = this.sanitizeSourceFilePath(args.source.path);
        this.breakpointsQueue[sanitizedPath] = args;
        let breakpoints = [];
        for (let breakpoint of args.breakpoints) {
            breakpoints.push({
                /** If true breakpoint could be set (but not necessarily at the desired location). */
                verified: false,
                id: this.getBreakpointRefId(this.sanitizeSourceFilePath(sanitizedPath), breakpoint.line),
                /** The source where the breakpoint is located. */
                source: args.source,
                // message: 'device is not in a stopped state',
                /** The start line of the actual range covered by the breakpoint. */
                line: breakpoint.line
            });
        }

        process.nextTick(() => {
            this.emit('changed', breakpoints);
        });

        return breakpoints;
    }

    public getBreakpointQueue(): { [refId: string]: DebugProtocol.SetBreakpointsArguments } {
        return this.breakpointsQueue;
    }

    private getBreakpointRefId(sourcePath: string, line: number) {
        let key = `${sourcePath}:${line}`;
        if (!this.breakpointRefIds[key]) {
            let id = Object.keys(this.breakpointRefIds).length + 1;
            this.breakpointRefIds[key] = id;
        }
        return this.breakpointRefIds[key];
    }

    /**
     * breakpoint lines are 1-based, and columns are zero-based
     */
    public registerBreakpoint(sourceFilePath: string, breakpoint: DebugProtocol.SourceBreakpoint | AugmentedSourceBreakpoint) {
        let bp = this.updateBreakpoint(sourceFilePath, breakpoint);

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
            if (this.launchConfiguration && this.launchConfiguration.sourceDirs && this.launchConfiguration.sourceDirs.length > 0) {
                let lastWorkingPath = '';
                for (const sourceDir of this.launchConfiguration.sourceDirs) {
                    sourceFilePath = sourceFilePath.replace(this.launchConfiguration.rootDir, sourceDir);
                    if (fsExtra.pathExistsSync(sourceFilePath)) {
                        lastWorkingPath = sourceFilePath;
                    }
                }
                sourceFilePath = lastWorkingPath;

            }

            bp.verified = bp.wasAddedBeforeLaunch;
        }
    }

    public updateBreakpoint(sourceFilePath: string, breakpoint: DebugProtocol.SourceBreakpoint | AugmentedSourceBreakpoint): AugmentedSourceBreakpoint {
        sourceFilePath = this.sanitizeSourceFilePath(sourceFilePath);
        //get the breakpoints array (and optionally initialize it if not set)
        let breakpointsArray = this.breakpointsByFilePath[sourceFilePath] = this.breakpointsByFilePath[sourceFilePath] ?? [];

        let existingBreakpoint = breakpointsArray.find(x => x.line === breakpoint.line);

        let bp = <AugmentedSourceBreakpoint>Object.assign(existingBreakpoint || {}, breakpoint);

        //set an id if one does not already exist (used for pushing breakpoints to the client)
        bp.id = bp.id ?? this.getBreakpointRefId(sourceFilePath, breakpoint.line);

        //set column=0 if the breakpoint is missing that field
        bp.column = bp.column ?? 0;

        bp.wasAddedBeforeLaunch = bp.wasAddedBeforeLaunch ?? this.areBreakpointsLocked === false;

        bp.protocolBreakpointIds = bp.protocolBreakpointIds ?? [];

        //any breakpoint set in this function is not hidden
        bp.isHidden = false;

        //new breakpoints will be verified=false, but breakpoints that were removed and then added again should be verified=true
        if (breakpointsArray.find(x => x.wasAddedBeforeLaunch && x.line === bp.line)) {
            bp.wasAddedBeforeLaunch = true;
        } else {
            bp.wasAddedBeforeLaunch = false;
        }

         //if we already have a breakpoint for this exact line, don't add another one
        if (breakpointsArray.find(x => x.line === breakpoint.line)) {
            return;
        } else {
            //add the breakpoint to the list
            breakpointsArray.push(bp);
        }

        return bp;
    }

    public async getBreakpointRequests(path: string, breakpoint: DebugProtocol.SourceBreakpoint,  project: ComponentLibraryProject | Project, fileProtocol: string) {
        let breakpoints = [];
        console.log(project);
        let stagingLocationsResult = await this.locationManager.getStagingLocations(
            path,
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

            if (project instanceof ComponentLibraryProject) {
                // If this is a Component Library project me need tp make sure we add the post fix to the path
                relativeStagingPath = project.addFileNamePostfix(relativeStagingPath);
            }

            let breakpointRequest: AddBreakpointRequestObject = {
                filePath: fileProtocol + '/' + relativeStagingPath,
                lineNumber: stagingLocation.lineNumber,
                hitCount: breakpoint.hitCondition ? parseInt(breakpoint.hitCondition) : 0
            };
            breakpoints.push(breakpointRequest);
        }
        return breakpoints;
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

            //hide all of the breakpoints (the active ones will be re-enabled later in this method)
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
     * Get the list of breakpoints for the specified file path, or an empty array
     */
    public getBreakpointsForFile(filePath: string): AugmentedSourceBreakpoint[] {
        let sanitizedPath = this.sanitizeSourceFilePath(filePath);
        return this.breakpointsByFilePath[sanitizedPath] ?? [];
    }

    /**
     * Get the list of breakpoints for the specified file path, or an empty array
     */
    public removeQueuedBreakpointsForFile(filePath: string) {
        let sanitizedPath = this.sanitizeSourceFilePath(filePath);
        delete this.breakpointsQueue[sanitizedPath];
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

    protocolBreakpointIds: number[];
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
