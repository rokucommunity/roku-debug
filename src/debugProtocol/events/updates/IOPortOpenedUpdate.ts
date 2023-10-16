import { SmartBuffer } from 'smart-buffer';
import { ErrorCode, UpdateType } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolUpdate, ProtocolResponse, ProtocolRequest } from '../ProtocolEvent';

export class IOPortOpenedUpdate {

    public static fromJson(data: {
        port: number;
    }) {
        const update = new IOPortOpenedUpdate();
        protocolUtil.loadJson(update, data);
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new IOPortOpenedUpdate();
        protocolUtil.bufferLoaderHelper(update, buffer, 16, (smartBuffer) => {
            protocolUtil.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);

            update.data.port = smartBuffer.readInt32LE();
        });
        return update;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(this.data.port); // primary_thread_index

        protocolUtil.insertCommonUpdateFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        /**
         * The port number to which the debugging client should connect to read the script's output
         */
        port: undefined as number,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ErrorCode.OK,
        updateType: UpdateType.IOPortOpened
    };
}

export function isIOPortOpenedUpdate(event: ProtocolRequest | ProtocolResponse | ProtocolUpdate): event is IOPortOpenedUpdate {
    return event?.constructor?.name === IOPortOpenedUpdate.name;
}
