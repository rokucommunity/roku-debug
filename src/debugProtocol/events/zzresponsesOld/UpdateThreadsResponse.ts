import { SmartBuffer } from 'smart-buffer';
import { STOP_REASONS, UPDATE_TYPES } from '../../Constants';
import { util } from '../../../util';

export class UpdateThreadsResponse {

    constructor(buffer: Buffer) {
        if (buffer.byteLength >= 12) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE();
                if (this.requestId === 0) {
                    this.errorCode = bufferReader.readUInt32LE();
                    this.updateType = bufferReader.readUInt32LE();

                    let threadsUpdate: ThreadAttached | ThreadsStopped;
                    if (this.updateType === UPDATE_TYPES.ALL_THREADS_STOPPED) {
                        threadsUpdate = new ThreadsStopped(bufferReader);
                    } else if (this.updateType === UPDATE_TYPES.THREAD_ATTACHED) {
                        threadsUpdate = new ThreadAttached(bufferReader);
                    }

                    if (threadsUpdate?.success) {
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
    public errorCode = -1;
    public updateType = -1;
    public data: ThreadAttached | ThreadsStopped;
}

export class ThreadsStopped {

    constructor(bufferReader: SmartBuffer) {
        if (bufferReader.length >= bufferReader.readOffset + 6) {
            this.primaryThreadIndex = bufferReader.readInt32LE();
            this.stopReason = getStopReason(bufferReader.readUInt8());
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
            this.stopReason = getStopReason(bufferReader.readUInt8());
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

function getStopReason(value: number): STOP_REASONS {
    switch (value) {
        case STOP_REASONS.BREAK:
            return STOP_REASONS.BREAK;
        case STOP_REASONS.NORMAL_EXIT:
            return STOP_REASONS.NORMAL_EXIT;
        case STOP_REASONS.NOT_STOPPED:
            return STOP_REASONS.NOT_STOPPED;
        case STOP_REASONS.RUNTIME_ERROR:
            return STOP_REASONS.RUNTIME_ERROR;
        case STOP_REASONS.STOP_STATEMENT:
            return STOP_REASONS.STOP_STATEMENT;
        case STOP_REASONS.UNDEFINED:
            return STOP_REASONS.UNDEFINED;
        default:
            return STOP_REASONS.UNDEFINED;
    }
}
