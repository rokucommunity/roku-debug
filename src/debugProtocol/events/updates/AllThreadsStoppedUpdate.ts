import { SmartBuffer } from 'smart-buffer';
import type { StopReason } from '../../Constants';
import { ErrorCode, StopReasonCode, UpdateType } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolUpdate } from '../ProtocolEvent';

/**
 * All threads are stopped and an ALL_THREADS_STOPPED message is sent to the debugging client.
 *
 * The data field includes information on why the threads were stopped.
 */
export class AllThreadsStoppedUpdate implements ProtocolUpdate {

    public static fromJson(data: {
        threadIndex: number;
        stopReason: StopReason;
        stopReasonDetail: string;
    }) {
        const update = new AllThreadsStoppedUpdate();
        protocolUtil.loadJson(update, data);
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new AllThreadsStoppedUpdate();
        protocolUtil.bufferLoaderHelper(update, buffer, 16, (smartBuffer) => {
            protocolUtil.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);

            update.data.threadIndex = smartBuffer.readInt32LE();
            update.data.stopReason = StopReasonCode[smartBuffer.readUInt8()] as StopReason;
            update.data.stopReasonDetail = protocolUtil.readStringNT(smartBuffer);
        });
        return update;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(this.data.threadIndex); // primary_thread_index
        smartBuffer.writeUInt8(StopReasonCode[this.data.stopReason]); // stop_reason
        smartBuffer.writeStringNT(this.data.stopReasonDetail); //stop_reason_detail

        protocolUtil.insertCommonUpdateFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        /**
         * The index of the primary thread that triggered the stop
         */
        threadIndex: undefined as number,
        stopReason: undefined as StopReason,
        stopReasonDetail: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ErrorCode.OK,
        updateType: UpdateType.AllThreadsStopped
    };
}
