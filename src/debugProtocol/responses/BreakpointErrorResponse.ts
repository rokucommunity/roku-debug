import { SmartBuffer } from 'smart-buffer';
import { util } from '../../util';
import { UPDATE_TYPES } from '../Constants';

export class BreakpointErrorResponse {

    constructor(buffer: Buffer, packetLength) {
        // The minimum size of a undefined response
        if (buffer.byteLength >= 12) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE(); // request_id

                // Updates will always have an id of zero because we didn't ask for this information
                if (this.requestId === 0) {
                    this.errorCode = bufferReader.readUInt32LE(); // error_code
                    this.updateType = bufferReader.readUInt32LE();

                    // Only handle undefined events in this class
                    if (this.updateType === UPDATE_TYPES.BREAKPOINT_ERROR) {
                        //giant hack...we don't know the structure of this, but we know there's an error message somewhere.
                        //just read until we find the first nonempty string.
                        while (bufferReader.readOffset < packetLength - 4) {
                            const errorMessage = util.readStringNT(bufferReader)?.trim();
                            if (errorMessage?.length > 6) {
                                this.errorMessages.push(errorMessage);
                            }
                        }
                        this.readOffset = bufferReader.readOffset;
                        this.success = true;
                    }
                }
            } catch (error) {
                // Could not process
            }
        }
    }
    public success = false;
    public readOffset = 0;

    // response fields
    public requestId = -1;
    public errorCode = -1;
    public updateType = -1;
    public errorMessages: string[] = [];
}
