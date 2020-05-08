import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, STOP_REASONS, UPDATE_TYPES } from '../Constants';
import { util } from '../../util';

export class UpdateThreadsResponse {

    constructor(buffer: Buffer) {
        if (buffer.byteLength >= 12) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE();
                if (this.requestId === 0) {
                    this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
                    this.updateType = UPDATE_TYPES[bufferReader.readUInt32LE()];

                    let threadsUpdate: ThreadsStopped | ThreadAttached;
                    if (this.updateType === 'ALL_THREADS_STOPPED') {
                        threadsUpdate = new ThreadsStopped(bufferReader);
                    } else if (this.updateType === 'THREAD_ATTACHED') {
                        threadsUpdate = new ThreadAttached(bufferReader);
                    }

                    if (threadsUpdate && threadsUpdate.success) {
                        this.data = threadsUpdate;
                        this.readOffset = bufferReader.readOffset;
                        this.success = true;
                    }
                }
            } catch (error) {
                // Can't be parsed
            }
        }
    }
    public success = false;
    public readOffset = 0;

    // response fields
    public requestId = -1;
    public errorCode: string;
    public updateType: string;
    public data: ThreadsStopped | ThreadAttached;
}

export class ThreadsStopped {

    constructor(bufferReader: SmartBuffer) {
        if (bufferReader.length >= bufferReader.readOffset + 6) {
            this.primaryThreadIndex = bufferReader.readInt32LE();
            this.stopReason = STOP_REASONS[bufferReader.readUInt8()];
            this.stopReasonDetail = util.readStringNT(bufferReader);
            this.success = true;
        }
    }
    public success = false;

    // response fields
    public primaryThreadIndex = -1;
    public stopReason = -1;
    public stopReasonDetail: string;
}

export class ThreadAttached {

    constructor(bufferReader: SmartBuffer) {
        if (bufferReader.length >= bufferReader.readOffset + 6) {
            this.threadIndex = bufferReader.readInt32LE();
            this.stopReason = STOP_REASONS[bufferReader.readUInt8()];
            this.stopReasonDetail = util.readStringNT(bufferReader);
            this.success = true;
        }
    }
    public success = false;

    // response fields
    public threadIndex = -1;
    public stopReason = -1;
    public stopReasonDetail: string;
}
