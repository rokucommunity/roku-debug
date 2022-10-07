import type { SmartBuffer } from 'smart-buffer';
import type { UPDATE_TYPES } from '../../Constants';
import { ProtocolResponse } from '../ProtocolResponse';

export abstract class UpdateResponse extends ProtocolResponse {

    protected bufferLoaderHelper(buffer: Buffer, minByteLength: number, updateType: UPDATE_TYPES, processor: (buffer: SmartBuffer) => boolean | void) {
        //extract the common update information
        super.bufferLoaderHelper(buffer, minByteLength + 12, null, (smartBuffer) => {
            this.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
            this.data.requestId = smartBuffer.readUInt32LE(); // request_id
            this.data.errorCode = smartBuffer.readUInt32LE(); // error_code

            if (smartBuffer.length < this.data.packetLength) {
                throw new Error(`Incomplete packet. Bytes received: ${smartBuffer.length}/${this.data.packetLength}`);
            }

            // requestId 0 means this is an update.
            if (this.data.requestId === 0) {
                this.data.updateType = smartBuffer.readUInt32LE();

                //if this is not the update type we want, return false
                if (this.data.updateType !== updateType) {
                    return false;
                }

            } else {
                //not an update. We should not proceed any further.
                throw new Error('This is not an update');
            }
            //call the specific update handler
            return processor(smartBuffer);
        });
    }

    public abstract data: {
        packetLength: number;
        requestId: number;
        errorCode: number;
        updateType: number;
    };
}

