import { SmartBuffer } from 'smart-buffer';
import type { StopReason } from '../../Constants';
import { ErrorCode, StopReasonCode, UpdateType } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';

export class ThreadAttachedUpdate {

    public static fromJson(data: {
        threadIndex: number;
        stopReason: StopReason;
        stopReasonDetail: string;
    }) {
        const update = new ThreadAttachedUpdate();
        protocolUtils.loadJson(update, data);
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new ThreadAttachedUpdate();
        protocolUtils.bufferLoaderHelper(update, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);
            update.data.threadIndex = smartBuffer.readInt32LE();
            update.data.stopReason = StopReasonCode[smartBuffer.readUInt8()] as StopReason;
            update.data.stopReasonDetail = protocolUtils.readStringNT(smartBuffer);
        });
        return update;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(this.data.threadIndex);
        smartBuffer.writeUInt8(StopReasonCode[this.data.stopReason]);
        smartBuffer.writeStringNT(this.data.stopReasonDetail);

        protocolUtils.insertCommonUpdateFields(this, smartBuffer);

        return smartBuffer.toBuffer();
    }

    public success = false;
    public readOffset = 0;

    public data = {
        /**
         * The index of the thread that was just attached
         */
        threadIndex: undefined as number,
        stopReason: undefined as StopReason,
        stopReasonDetail: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ErrorCode.OK,
        updateType: UpdateType.ThreadAttached
    };
}
