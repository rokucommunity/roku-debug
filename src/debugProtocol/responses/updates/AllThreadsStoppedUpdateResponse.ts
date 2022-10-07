import { SmartBuffer } from 'smart-buffer';
import { STOP_REASONS, UPDATE_TYPES } from '../../Constants';
import { util } from '../../../util';
import { ProtocolResponse } from '../ProtocolResponse';
import { UpdateResponse } from './UpdateResponse';

/**
 * All threads are stopped and an ALL_THREADS_STOPPED message is sent to the debugging client.
 *
 * The data field includes information on why the threads were stopped.
 */
export class AllThreadsStoppedUpdateResponse extends UpdateResponse {
    public constructor(arg: Buffer | Pick<AllThreadsStoppedUpdateResponse['data'], 'primaryThreadIndex' | 'stopReason' | 'stopReasonDetail'>) {
        super();
        if (Buffer.isBuffer(arg)) {
            this.loadBuffer(arg);
        } else {
            this.loadJson(arg);
        }
    }

    private loadBuffer(buffer: Buffer) {
        this.bufferLoaderHelper(buffer, 12, UPDATE_TYPES.ALL_THREADS_STOPPED, (smartBuffer) => {
            //bail if it's not the update type we wanted
            if (this.data.updateType !== UPDATE_TYPES.ALL_THREADS_STOPPED) {
                return false;
            }
            this.data.primaryThreadIndex = smartBuffer.readInt32LE();
            this.data.stopReason = getStopReason(smartBuffer.readUInt8());
            this.data.stopReasonDetail = util.readStringNT(smartBuffer);
        });
    }

    public toBuffer() {
        let buffer = new SmartBuffer();
        buffer.writeUInt32LE(this.data.requestId); // request_id
        buffer.writeUInt32LE(this.data.errorCode); // error_code
        buffer.writeUInt32LE(this.data.updateType); // update_type

        buffer.writeUInt32LE(this.data.primaryThreadIndex); // update_type
        buffer.writeUInt8(this.data.stopReason); // stop_reason
        buffer.writeStringNT(this.data.stopReasonDetail); //stop_reason_detail

        return this.getBufferWithPacketLength(buffer);
    }

    public data = {
        // DebuggerUpdate fields
        packetLength: undefined as number,
        requestId: undefined as number,
        errorCode: undefined as number,
        updateType: UPDATE_TYPES.ALL_THREADS_STOPPED,

        //ALL_THREADS_STOPPED fields
        primaryThreadIndex: -1,
        stopReason: -1,
        stopReasonDetail: undefined as string
    };
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
