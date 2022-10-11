import { SmartBuffer } from 'smart-buffer';
import type { STOP_REASONS } from '../../Constants';
import { ERROR_CODES, UPDATE_TYPES } from '../../Constants';
import { util } from '../../../util';
import { protocolUtils } from '../../ProtocolUtil';

export class ThreadAttachedUpdate {

    public static fromJson(data: {
        threadIndex: number;
        stopReason: number;
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
            update.data.stopReason = smartBuffer.readUInt8();
            update.data.stopReasonDetail = protocolUtils.readStringNT(smartBuffer);
        });
        return update;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(this.data.threadIndex);
        smartBuffer.writeUInt8(this.data.stopReason);
        smartBuffer.writeStringNT(this.data.stopReasonDetail);

        protocolUtils.insertCommonUpdateFields(this, smartBuffer);

        return smartBuffer.toBuffer();
    }

    public success = false;
    public readOffset = 0;

    public data = {
        threadIndex: undefined as number,
        stopReason: undefined as STOP_REASONS,
        stopReasonDetail: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ERROR_CODES.OK,
        updateType: UPDATE_TYPES.THREAD_ATTACHED
    };
}
