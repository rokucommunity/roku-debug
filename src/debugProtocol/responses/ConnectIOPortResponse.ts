import { SmartBuffer } from 'smart-buffer';
import { UPDATE_TYPES } from '../Constants';

export class ConnectIOPortResponse {

    constructor(buffer: Buffer) {
        // The minimum size of a connect to IO port request
        if (buffer.byteLength >= 16) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE(); // request_id

                // Updates will always have an id of zero because we didn't ask for this information
                if (this.requestId === 0) {
                    this.errorCode = bufferReader.readUInt32LE(); // error_code
                    this.updateType = bufferReader.readUInt32LE(); // update_type

                    // Only handle IO port events in this class
                    if (this.updateType === UPDATE_TYPES.IO_PORT_OPENED) {
                        this.data = bufferReader.readUInt32LE(); // data
                        this.readOffset = bufferReader.readOffset;
                        this.success = true;
                    }
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
    public errorCode = -1;
    public updateType = -1;
    public data = -1;
}
