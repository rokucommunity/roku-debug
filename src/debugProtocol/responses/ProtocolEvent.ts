import { SmartBuffer } from 'smart-buffer';

export class ProtocolEvent {
    constructor(buffer: Buffer) {
        // The smallest a request response can be
        if (buffer.byteLength >= 8) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE(); // request_id
                this.errorCode = bufferReader.readUInt32LE(); // error_code

                // Any request id less then one is an update and we should not process it here
                if (this.requestId > 0) {
                    this.readOffset = bufferReader.readOffset;
                } else if (this.requestId === 0) {
                    this.updateType = bufferReader.readUInt32LE();
                }
                this.readOffset = bufferReader.readOffset;
                this.success = true;
            } catch (error) {
                // Could not parse
            }
        }
    }

    public success = false;
    public readOffset = 0;

    // response fields
    public packetLength = 0;
    public requestId = -1;
    public updateType = -1;
    public errorCode = -1;
    public data = -1;
}
