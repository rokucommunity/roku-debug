import { SmartBuffer } from 'smart-buffer';
import { util } from '../../../util';
import { UPDATE_TYPES } from '../../Constants';

/**
 * Data sent as the data segment of message type: BREAKPOINT_ERROR
    ```
    struct BreakpointErrorUpdateData {
        uint32                    flags;              // Always 0, reserved for future use
        uint32                    breakpoint_id;
        uint32                    num_compile_errors;
        utf8z[num_compile_errors] compile_errors;
        uint32                    num_runtime_errors;
        utf8z[num_runtime_errors] runtime_errors;
        uint32                    num_other_errors;   // E.g., permissions errors
        utf8z[num_other_errors]   other_errors;
    }
    ```
*/
export class BreakpointErrorUpdateResponse {

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
            if (this.updateType === UPDATE_TYPES.BREAKPOINT_ERROR) {
                try {
                    this.flags = bufferReader.readUInt32LE(); // flags - always 0, reserved for future use
                    this.breakpointId = bufferReader.readUInt32LE(); // breakpoint_id

                    this.compileErrorCount = bufferReader.readUInt32LE(); // num_compile_errors
                    for (let i = 0; i < this.compileErrorCount; i++) {
                        this.compileErrors.push(
                            util.readStringNT(bufferReader)
                        );
                    }

                    this.runtimeErrorCount = bufferReader.readUInt32LE(); // num_runtime_errors
                    for (let i = 0; i < this.runtimeErrorCount; i++) {
                        this.runtimeErrors.push(
                            util.readStringNT(bufferReader)
                        );
                    }

                    this.otherErrorCount = bufferReader.readUInt32LE(); // num_other_errors
                    for (let i = 0; i < this.otherErrorCount; i++) {
                        this.otherErrors.push(
                            util.readStringNT(bufferReader)
                        );
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
    public breakpointId: number;

    public compileErrorCount: number;
    public compileErrors: string[] = [];

    public runtimeErrorCount: number;
    public runtimeErrors: string[] = [];

    public otherErrorCount: number;
    public otherErrors: string[] = [];
}
