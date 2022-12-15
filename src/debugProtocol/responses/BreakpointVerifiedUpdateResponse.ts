import { SmartBuffer } from 'smart-buffer';
import { util } from '../../util';
import { UPDATE_TYPES } from '../Constants';

/**
```
// Data sent as the data segment of message type: BREAKPOINT_VERIFIED
struct BreakpointVerifiedUpdateData {
    uint32 flags             // Always 0, reserved for future use
    uint32 num_breakpoints
    BreakpointVerifiedInfo[num_breakpoints] breakpoint_verified_info
}

struct BreakpointVerifiedInfo {
    uint32 breakpoint_id
}
```
*/
export class BreakpointVerifiedUpdateResponse {

    constructor(buffer: Buffer) {
        // The minimum size of a undefined response
        if (buffer.byteLength >= 12) {
            let bufferReader = SmartBuffer.fromBuffer(buffer);
            this.requestId = bufferReader.readUInt32LE();

            // Updates will always have an id of zero because we didn't ask for this information
            if (this.requestId === 0) {
                this.errorCode = bufferReader.readUInt32LE();
                this.updateType = bufferReader.readUInt32LE();
            }
            if (this.updateType === UPDATE_TYPES.BREAKPOINT_VERIFIED) {
                try {
                    this.flags = bufferReader.readUInt32LE(); // flags - always 0, reserved for future use

                    this.numBreakpoints = bufferReader.readUInt32LE(); // num_breakpoints
                    for (let i = 0; i < this.numBreakpoints; i++) {
                        this.breakpoints.push({
                            breakpointId: bufferReader.readUInt32LE()
                        });
                    }
                    this.success = true;
                } catch (error) {
                    // Could not process
                }
            }
        }
    }
    public success = false;
    public readOffset = 0;
    public requestId = -1;
    public errorCode = -1;
    public updateType = -1;

    public flags: number;
    public numBreakpoints: number;

    public breakpoints: VerifiedBreakpoint[] = [];
}

export interface VerifiedBreakpoint {
    breakpointId: number;
}

export interface VerifiedBreakpointsData {
    breakpoints: VerifiedBreakpoint[];
}
