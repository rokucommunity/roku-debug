import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, UPDATE_TYPES } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';

export class IOPortOpenedUpdate {

    public static fromJson(data: {
        port: number;
    }) {
        const update = new IOPortOpenedUpdate();
        protocolUtils.loadJson(update, data);
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new IOPortOpenedUpdate();
        protocolUtils.bufferLoaderHelper(update, buffer, 16, (smartBuffer) => {
            protocolUtils.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);

            update.data.port = smartBuffer.readInt32LE();
        });
        return update;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(this.data.port); // primary_thread_index

        protocolUtils.insertCommonUpdateFields(this, smartBuffer);
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
        errorCode: ERROR_CODES.OK,
        updateType: UPDATE_TYPES.IO_PORT_OPENED
    };
}
