import { standardizePath as s } from '../FileUtils';
import type { DebugProtocol } from 'vscode-debugprotocol';
import { IdGenerator } from '../IdGenerator';
type SourceBreakpoint = DebugProtocol.SourceBreakpoint;

export class BreakpointQueue {

    /**
     * Breakpoints by file
     */
    private queuedBreakpoints = new BpMap();

    /**
     * System breakpoints by file. These can only be managed with
     * `addSystemBreakpoint` and `removeSystemBreakpoint`.
     */
    private systemBreakpoints = new BpMap();

    /**
     * The list of all breakpoints in the system. This is updated every time `diff()` is called.
     */
    private state = new BpMap();

    /**
     * An ID generator
     */
    private idgen = new IdGenerator<string>();

    /**
     * A list of file paths whose breakpoints have changed since the last flush
     */
    private changedPaths = new Set<string>();

    /**
     * Set/replace/delete the list of breakpoints for this file.
     * @param srcPath the path to the source file
     * @param breakpoints the entire list of breakpoints for the file.
     */
    public setBreakpoints(srcPath: string, breakpoints: SourceBreakpoint[]): QueueBreakpoint[] {
        const result = this.sanitizeBreakpoints(srcPath, [
            ...breakpoints,
            ...this.systemBreakpoints.get(srcPath) ?? []
        ]);
        //replace the previous breakpoints list
        this.queuedBreakpoints.set(srcPath, result);

        return result;
    }

    /**
     * Set a system breakpoint for a file. These can only be deleted by
     * calling removeSystemBreakpoint.
     */
    public setSystemBreakpoint(srcPath: string, breakpoint: SourceBreakpoint) {
        const breakpoints = this.sanitizeBreakpoints(srcPath, [
            {
                ...breakpoint,
                isSystemBreakpoint: true
            },
            ...this.systemBreakpoints.get(srcPath) ?? []
        ]);
        this.systemBreakpoints.set(srcPath, breakpoints);

        //add the system breakpoint to the list of all breakpoints
        this.setBreakpoints(srcPath, [
            ...this.queuedBreakpoints.get(srcPath) ?? [],
            ...breakpoints
        ]);

        return breakpoints[0];
    }

    /**
     * Remove a system breakpoint
     */
    public deleteSystemBreakpoint(srcPath: string, breakpoint: SourceBreakpoint) {
        const sortKey = this.getSortKey(breakpoint);
        const breakpoints = this.systemBreakpoints.get(srcPath) ?? [];

        const idx = breakpoints.findIndex(x => x.sortKey === sortKey);
        if (idx > -1) {
            return breakpoints.splice(idx, 1)[0];
        }
    }

    /**
     * Sanitize and dedupe a list of breakpoints
     */
    private sanitizeBreakpoints(srcPath: string, breakpoints: Array<SourceBreakpoint | QueueBreakpoint>) {
        const fileKey = s`${srcPath}`.toLowerCase();
        const map = new Map<string, QueueBreakpoint>();
        for (const breakpoint of (breakpoints as QueueBreakpoint[])) {
            //set default line/col values to prevent null crashes downstream if missing
            breakpoint.line = breakpoint.line ?? 0;
            breakpoint.column = breakpoint.column ?? 0;

            breakpoint.sortKey = this.getSortKey(breakpoint);

            breakpoint.id = this.idgen.getId(`${fileKey}:${breakpoint.line}`);

            map.set(breakpoint.sortKey, breakpoint);
        }

        const result = [...map.values()].sort((a, b) => {
            return a.sortKey.localeCompare(b.sortKey);
        });
        return result;
    }

    /**
     * Get a string that is used to sort a breakpoint. This is padded line and column info.
     */
    private getSortKey(breakpoint: { line: number; column?: number }) {
        return `${breakpoint.line.toString().padStart(5, '0')}.${(breakpoint.column ?? 0).toString().padStart(5, '0')}`;
    }

    /**
     * Get a diff of the breakpoints that have changed since the last time this was called
     */
    public diff() {
        //all the breakpoints that were changed since last time this function was called
        const queued = new BpMap(
            this.queuedBreakpoints
        );
        //merge in the system breakpoints
        for (const [srcPath, breakpoints] of this.systemBreakpoints) {
            const merged = this.sanitizeBreakpoints(srcPath, [
                ...this.queuedBreakpoints.get(srcPath) ?? [],
                ...breakpoints
            ]);
            queued.set(srcPath, merged);
        }

        const result: Diff = {
            added: new BpMap(),
            deleted: new BpMap()
        };
        //build the diff
        for (const [srcPath, queuedBreakpoints] of queued) {
            const current = this.state.get(srcPath);

            //calculate the diff between the two breakpoint lists
            const diff = this.bpDiff(current, queuedBreakpoints);
            result.added.set(srcPath, diff.added);
            result.deleted.set(srcPath, diff.deleted);

            //overwrite state with the new set of breakpoints
            this.state.set(srcPath, queuedBreakpoints);
        }


        this.queuedBreakpoints = new BpMap();

        return result;
    }

    private bpDiff(current: QueueBreakpoint[], queued: QueueBreakpoint[]) {
        //copy the arrays so we can modify them in-place
        current = [...current ?? []];
        queued = [...queued ?? []];
        const result = {
            added: [] as QueueBreakpoint[],
            deleted: [] as QueueBreakpoint[]
        };
        for (let i = current.length - 1; i >= 0; i--) {
            const currentBp = current[i];
            //skip breakpoints that haven't changed
            const idx = queued.findIndex(x => x.sortKey === currentBp.sortKey);
            if (idx > -1) {
                queued.splice(idx, 1);
            } else {
                //breakpoint is missing in queued, which means this is a delete
                result.deleted.push(currentBp);
                current.splice(i, 1);
            }
        }
        //remaining items are the added breakpoints
        result.added = queued;

        return result;
    }

    // /**
    //  * breakpoint lines are 1-based, and columns are zero-based
    //  */
    // public registerBreakpoint(sourceFilePath: string, breakpoint:) {
    //     sourceFilePath = this.sanitizeSourceFilePath(sourceFilePath);
    //     //get the breakpoints array (and optionally initialize it if not set)
    //     let breakpointsArray = this.breakpointsByFilePath[sourceFilePath] ?? [];
    //     this.breakpointsByFilePath[sourceFilePath] = breakpointsArray;

    //     let existingBreakpoint = breakpointsArray.find(x => x.line === breakpoint.line);

    //     let bp = <AugmentedSourceBreakpoint>Object.assign(existingBreakpoint || {}, breakpoint);

    //     //set column=0 if the breakpoint is missing that field
    //     bp.column = bp.column ?? 0;

    //     bp.wasAddedBeforeLaunch = bp.wasAddedBeforeLaunch ?? this.areBreakpointsLocked === false;

    //     //set an id if one does not already exist (used for pushing breakpoints to the client)
    //     bp.id = bp.id ?? BreakpointManager.breakpointIdSequence++;

    //     //any breakpoint set in this function is not hidden
    //     bp.isHidden = false;

    //     //mark non-supported breakpoint as NOT verified, since we don't support debugging non-brightscript files
    //     if (!fileUtils.hasAnyExtension(sourceFilePath, ['.brs', '.bs', '.xml'])) {
    //         bp.verified = false;

    //         //debug session is not launched yet, all of these breakpoints are treated as verified
    //     } else if (this.areBreakpointsLocked === false) {
    //         //confirm that breakpoint is at a valid location. TODO figure out how to determine valid locations...
    //         bp.verified = true;

    //         //a debug session is currently running
    //     } else {
    //         //TODO use the standard reverse-lookup logic for converting the rootDir or stagingDir paths into sourceDirs

    //         //if a breakpoint gets set in rootDir, and we have sourceDirs, convert the rootDir path to sourceDirs path
    //         //so the breakpoint gets moved into the source file instead of the output file
    //         if (this.launchConfiguration?.sourceDirs && this.launchConfiguration.sourceDirs.length > 0) {
    //             let lastWorkingPath = '';
    //             for (const sourceDir of this.launchConfiguration.sourceDirs) {
    //                 sourceFilePath = sourceFilePath.replace(this.launchConfiguration.rootDir, sourceDir);
    //                 if (fsExtra.pathExistsSync(sourceFilePath)) {
    //                     lastWorkingPath = sourceFilePath;
    //                 }
    //             }
    //             sourceFilePath = lastWorkingPath;

    //         }
    //         //new breakpoints will be verified=false, but breakpoints that were removed and then added again should be verified=true
    //         if (breakpointsArray.find(x => x.wasAddedBeforeLaunch && x.line === bp.line)) {
    //             bp.verified = true;
    //             bp.wasAddedBeforeLaunch = true;
    //         } else {
    //             bp.verified = false;
    //             bp.wasAddedBeforeLaunch = false;
    //         }
    //     }

    //     //if we already have a breakpoint for this exact line, don't add another one
    //     if (breakpointsArray.find(x => x.line === breakpoint.line)) {

    //     } else {
    //         //add the breakpoint to the list
    //         breakpointsArray.push(bp);
    //     }
    // }
}

export interface QueueBreakpoint extends SourceBreakpoint {
    column: number;
    /**
     * An ID for this breakpoint, which is used to set/unset breakpoints in the client. Arbitrary number,
     * but will always be the same number for a breakpoint at this position
     */
    id: number;
    /**
     * Key used to sort the breakpoints in ascending order in the file
     */
    sortKey: string;
    /**
     * This is a breakpoint added by roku-debug itself (entry breakpoint, run to line, etc...).
     * Generally this means the breakpoint will remain in this queue until roku-debug explicitly removes it.
     * These should not be sent to the client at all.
     */
    isSystemBreakpoint: boolean;
}

/**
 * A wraper around `Map` that standardizes the key as a lower-case path
 */
class BpMap extends Map<string, QueueBreakpoint[]> {
    public set(key: string, value: QueueBreakpoint[]) {
        return super.set(
            s`${key}`.toLowerCase(),
            value
        );
    }
    public get(key: string) {
        return super.get(
            s`${key}`.toLowerCase()
        );
    }
    public delete(key: string) {
        return super.delete(
            s`${key}`.toLowerCase()
        );
    }
}

interface Diff {
    deleted: BpMap;
    added: BpMap;
}
