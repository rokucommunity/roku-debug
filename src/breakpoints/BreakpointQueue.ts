import { standardizePath as s } from '../FileUtils';
import type { DebugProtocol } from 'vscode-debugprotocol';
import * as EventEmitter from 'events';

export type SourceBreakpoint = DebugProtocol.SourceBreakpoint;

export class BreakpointQueue {

    private emitter = new EventEmitter();

    public on(event: 'add', handler: (breakpoint: QueueBreakpoint) => void): () => void
    public on(event: 'delete', handler: (breakpoint: QueueBreakpoint) => void): () => void
    public on(event: string, handler: (param: any) => void): () => void {
        this.emitter.on(event, handler);
        return () => {
            this.emitter.off(event, handler);
        };
    }

    private emit(event: 'add', data: QueueBreakpoint)
    private emit(event: 'delete', data: QueueBreakpoint)
    private emit(event: string, data: any) {
        this.emitter.emit(event, data);
    }

    /**
     * Breakpoints by file
     */
    private breakpoints = new BpMap();

    /**
     * System breakpoints by file. These can only be managed with
     * `addSystemBreakpoint` and `removeSystemBreakpoint`.
     */
    private systemBreakpoints = new BpMap();

    /**
     * Marks the queue as dirty, meaning there have been changes since the last time.
     */
    public isDirty = false;

    public getBreakpoints() {
        const result = [] as QueueBreakpoint[];
        for (const [srcPath, breakpoints] of this.breakpoints) {
            for (const breakpoint of breakpoints) {
                breakpoint.srcPath = srcPath;
            }
            result.push(
                ...breakpoints
            );
        }
        return result;
    }

    /**
     * Set/replace/delete the list of breakpoints for this file.
     * @param srcPath the path to the source file
     * @param breakpoints the entire list of breakpoints for the file.
     */
    public setBreakpoints(srcPath: string, breakpoints: SourceBreakpoint[]): QueueBreakpoint[] {
        this.isDirty = true;
        const result = this.sanitizeBreakpoints(srcPath, [
            ...breakpoints,
            ...this.systemBreakpoints.get(srcPath) ?? []
        ]);
        //replace the previous breakpoints list
        this.breakpoints.set(srcPath, result);

        return result;
    }

    /**
     * Add a breakpoint
     */
    public addBreakpoint(srcPath: string, breakpoint: SourceBreakpoint) {
        this.setBreakpoints(srcPath, [
            breakpoint,
            ...this.breakpoints.get(srcPath) ?? []
        ]);
        this.emit('add', breakpoint as QueueBreakpoint);
    }

    /**
     * Delete a breakpoint
     */
    public deleteBreakpoint(srcPath: string, breakpoint: SourceBreakpoint) {
        this.isDirty = true;
        const sortKey = this.getSortKey(breakpoint);
        const breakpoints = this.breakpoints.get(srcPath) ?? [];
        const index = breakpoints.findIndex(x => x.sortKey === sortKey);
        if (index > -1) {
            breakpoints.splice(index, 1);
        }
        (breakpoint as QueueBreakpoint).srcPath = s`${srcPath}`;
        this.emit('delete', breakpoint as QueueBreakpoint);
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
            ...this.breakpoints.get(srcPath) ?? [],
            ...breakpoints
        ]);

        return breakpoints[0];
    }

    /**
     * Remove a system breakpoint
     */
    public deleteSystemBreakpoint(srcPath: string, breakpoint: SourceBreakpoint) {
        this.isDirty = true;
        const sortKey = this.getSortKey(breakpoint);
        //remove the breakpoint from both breakpoint lists
        for (const breakpoints of [this.systemBreakpoints.get(srcPath) ?? [], this.breakpoints.get(srcPath) ?? []]) {
            const idx = breakpoints.findIndex(x => x.sortKey === sortKey);
            if (idx > -1) {
                breakpoints.splice(idx, 1);
            }
        }
    }

    /**
     * Sanitize and dedupe a list of breakpoints
     */
    private sanitizeBreakpoints(srcPath: string, breakpoints: Array<SourceBreakpoint | QueueBreakpoint>) {
        srcPath = s`${srcPath}`;
        const map = new Map<string, QueueBreakpoint>();
        for (const breakpoint of (breakpoints as QueueBreakpoint[])) {
            //set default line/col values to prevent null crashes downstream if missing
            breakpoint.line = breakpoint.line ?? 0;
            breakpoint.column = breakpoint.column ?? 0;
            breakpoint.srcPath = srcPath;
            breakpoint.sortKey = this.getSortKey(breakpoint);

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
    /**
     * The path to the source file where the breakpoint is set
     */
    srcPath: string;
}

/**
 * A wraper around `Map` that standardizes the key as a lower-case path
 */
export class BpMap extends Map<string, QueueBreakpoint[]> {
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
