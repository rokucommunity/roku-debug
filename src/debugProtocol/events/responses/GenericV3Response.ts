import { SmartBuffer } from 'smart-buffer';
import type { ErrorCode } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';

export class GenericV3Response {
    public static fromJson(data: {
        requestId: number;
        errorCode: ErrorCode;
    }) {
        const response = new GenericV3Response();
        protocolUtil.loadJson(response, data);
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new GenericV3Response();
        protocolUtil.bufferLoaderHelper(response, buffer, 12, (smartBuffer: SmartBuffer) => {
            response.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
            response.data.requestId = smartBuffer.readUInt32LE(); // request_id
            response.data.errorCode = smartBuffer.readUInt32LE(); // error_code

            //this is a generic response, so we don't actually know what the rest of the payload is.
            //so just consume the rest of the payload as throwaway data
            response.readOffset = response.data.packetLength;
        });
        return response;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        protocolUtil.insertCommonResponseFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        packetLength: undefined as number,
        requestId: Number.MAX_SAFE_INTEGER,
        errorCode: undefined as ErrorCode
    };
}
