import * as path from 'path';
import { SmartBuffer } from 'smart-buffer';
import { util } from '../../../util';

export class StackTraceResponse {

    constructor(buffer: Buffer) {
        // The smallest a stacktrace request response can be
        if (buffer.byteLength >= 8) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE();

                // Any request id less then one is an update and we should not process it here
                if (this.requestId > 0) {
                    this.errorCode = bufferReader.readUInt32LE();
                    this.stackSize = bufferReader.readUInt32LE();

                    for (let i = 0; i < this.stackSize; i++) {
                        let stackEntry = new StackEntry(bufferReader);
                        if (stackEntry.success) {
                            // All the necessary stack entry data was present. Push to the entries array.
                            this.entries.push(stackEntry);
                        }
                    }

                    this.readOffset = bufferReader.readOffset;
                    this.success = (this.entries.length === this.stackSize);
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
    public stackSize = -1;
    public entries = [];
}

export class StackEntry {

    constructor(bufferReader: SmartBuffer) {
        this.lineNumber = bufferReader.readUInt32LE();
        // NOTE: this is documented as being function name then file name but it is being returned by the device backwards.
        this.fileName = util.readStringNT(bufferReader);
        this.functionName = util.readStringNT(bufferReader);

        let fileExtension = path.extname(this.fileName).toLowerCase();
        // NOTE:Make sure we have a full valid path (?? can be valid because the device might not know the file).
        this.success = (fileExtension === '.brs' || fileExtension === '.xml' || this.fileName === '??');
    }
    public success = false;

    // response fields
    public lineNumber = -1;
    public functionName: string;
    public fileName: string;
}
