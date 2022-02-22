import { SmartBuffer } from 'smart-buffer';

export class ExecuteResponseV3 {
    constructor(buffer: Buffer) {
        // The smallest a request response can be
        if (buffer.byteLength >= 12) {
            try {
                throw new Error('TODO');
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.packetLength = bufferReader.readUInt32LE(); // packet_length
                this.requestId = bufferReader.readUInt32LE(); // request_id
                this.errorCode = bufferReader.readUInt32LE(); // error_code

                if (bufferReader.length < this.packetLength) {
                    throw new Error(`Incomplete packet. Bytes received: ${bufferReader.length}/${this.packetLength}`);
                }

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
