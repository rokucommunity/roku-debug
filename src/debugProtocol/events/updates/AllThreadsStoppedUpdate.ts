import { SmartBuffer } from 'smart-buffer';
import type { ERROR_CODES } from '../../Constants';
import { STOP_REASONS, UPDATE_TYPES } from '../../Constants';
import { util } from '../../../util';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolUpdate } from '../ProtocolEvent';

/**
 * All threads are stopped and an ALL_THREADS_STOPPED message is sent to the debugging client.
 *
 * The data field includes information on why the threads were stopped.
 */
export class AllThreadsStoppedUpdate implements ProtocolUpdate {

    public static fromJson(data: {
        errorCode: ERROR_CODES;
        primaryThreadIndex: number;
        stopReason: number;
        stopReasonDetail: string;
    }) {
        const response = new AllThreadsStoppedUpdate();
        protocolUtils.loadJson(response, data);
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new AllThreadsStoppedUpdate();
        protocolUtils.bufferLoaderHelper(response, buffer, 16, (smartBuffer) => {
            protocolUtils.loadCommonUpdateFields(response, smartBuffer, UPDATE_TYPES.ALL_THREADS_STOPPED);

            response.data.primaryThreadIndex = smartBuffer.readInt32LE();
            response.data.stopReason = getStopReason(smartBuffer.readUInt8());
            response.data.stopReasonDetail = util.readStringNT(smartBuffer);
        });
        return response;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(this.data.primaryThreadIndex); // primary_thread_index
        smartBuffer.writeUInt8(this.data.stopReason); // stop_reason
        smartBuffer.writeStringNT(this.data.stopReasonDetail); //stop_reason_detail

        protocolUtils.insertCommonUpdateFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        primaryThreadIndex: undefined as number,
        stopReason: undefined as STOP_REASONS,
        stopReasonDetail: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: undefined as ERROR_CODES,
        updateType: UPDATE_TYPES.ALL_THREADS_STOPPED
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
