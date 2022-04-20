import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES } from '../Constants';

export class ListBreakpointsResponse {

    constructor(buffer: Buffer) {
        // The minimum size of a request
        if (buffer?.byteLength >= 12) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE(); // request_id

                // Any request id less then one is an update and we should not process it here
                if (this.requestId > 0) {
                    this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
                    this.numBreakpoints = bufferReader.readUInt32LE(); // num_breakpoints - The number of breakpoints in the breakpoints array.

                    // build the list of BreakpointInfo
                    for (let i = 0; i < this.numBreakpoints; i++) {
                        let breakpointInfo = new BreakpointInfo(bufferReader);
                        // All the necessary data was present, so keep this item
                        this.breakpoints.push(breakpointInfo);
                    }

                    this.readOffset = bufferReader.readOffset;
                    this.success = (this.breakpoints.length === this.numBreakpoints);
                }
            } catch (error) {
                // Could not parse
            }
        }
    }
    public success = false;
    public readOffset = 0;

    // response fields
    public requestId = -1;
    public numBreakpoints: number;
    public breakpoints = [] as BreakpointInfo[];
    public data = -1;
    public errorCode: string;
}

export class BreakpointInfo {
    constructor(bufferReader: SmartBuffer) {
        // breakpoint_id - The ID assigned to the breakpoint. An ID greater than 0 indicates an active breakpoint. An ID of 0 denotes that the breakpoint has an error.
        this.breakpointId = bufferReader.readUInt32LE();
        // error_code - Indicates whether the breakpoint was successfully returned.
        this.errorCode = bufferReader.readUInt32LE();

        if (this.breakpointId > 0) {
            // This argument is only present if the breakpoint_id is valid.
            // ignore_count - Current state, decreases as breakpoint is executed.
            this.hitCount = bufferReader.readUInt32LE();
        }
        this.success = true;
    }

    public get isVerified() {
        return this.breakpointId > 0;
    }
    public success = false;
    public breakpointId: number;
    public errorCode: number;
    /**
     * The textual description of the error code
     */
    public get errorText() {
        return ERROR_CODES[this.errorCode];
    }
    public hitCount: number;
}
