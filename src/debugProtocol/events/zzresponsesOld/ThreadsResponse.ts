import * as path from 'path';
import { SmartBuffer } from 'smart-buffer';
import { STOP_REASONS } from '../../Constants';
import { util } from '../../../util';

export class ThreadsResponse {

    constructor(buffer: Buffer) {
        // The smallest a threads request response can be
        if (buffer.byteLength >= 21) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE();

                // Any request id less then one is an update and we should not process it here
                if (this.requestId > 0) {
                    this.errorCode = bufferReader.readUInt32LE();
                    this.threadsCount = bufferReader.readUInt32LE();

                    for (let i = 0; i < this.threadsCount; i++) {
                        let stackEntry = new ThreadInfo(bufferReader);
                        if (stackEntry.success) {
                            // All the necessary stack entry data was present. Push to the entries array.
                            this.threads.push(stackEntry);
                        }
                    }

                    this.readOffset = bufferReader.readOffset;
                    this.success = (this.threads.length === this.threadsCount);
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
    public threadsCount = -1;
    public threads = [];
}

export class ThreadInfo {

    constructor(bufferReader: SmartBuffer) {
        // NOTE: The docs say the flags should be unit8 and uint32. In testing it seems like they are sending uint32 but meant to send unit8.
        // eslint-disable-next-line no-bitwise
        this.isPrimary = (bufferReader.readUInt32LE() & 0x01) > 0;
        this.stopReason = STOP_REASONS[bufferReader.readUInt8()];
        this.stopReasonDetail = util.readStringNT(bufferReader);
        this.lineNumber = bufferReader.readUInt32LE();
        this.functionName = util.readStringNT(bufferReader);
        this.fileName = util.readStringNT(bufferReader);
        this.codeSnippet = util.readStringNT(bufferReader);

        let fileExtension = path.extname(this.fileName).toLowerCase();
        // NOTE: Make sure we have a full valid path (?? can be valid because the device might not know the file) and that we have a codeSnippet.
        this.success = (fileExtension === '.brs' || fileExtension === '.xml' || this.fileName === '??') && this.codeSnippet.length > 1;
    }
    public success = false;

    // response fields
    public isPrimary: boolean;
    public stopReason: string;
    public stopReasonDetail: string;
    public lineNumber = -1;
    public functionName: string;
    public fileName: string;
    public codeSnippet: string;
}
