import { SmartBuffer } from 'smart-buffer';
import { util } from './util';

class DebuggerHandshake {

    constructor(buffer: Buffer) {
        // Required size of the handshake
        if (buffer.byteLength >= 20) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.magic = util.readStringNT(bufferReader); // magic_number
                this.majorVersion = bufferReader.readInt32LE(); // protocol_major_version
                this.minorVersion = bufferReader.readInt32LE(); // protocol_minor_version
                this.patchVersion = bufferReader.readInt32LE(); // protocol_patch_version
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
    public magic: string;
    public majorVersion = -1;
    public minorVersion = -1;
    public patchVersion = -1;
}

export { DebuggerHandshake };
