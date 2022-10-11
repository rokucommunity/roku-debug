import { SmartBuffer } from 'smart-buffer';
import type { ErrorCode } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';

export class GenericResponse {
    public static fromJson(data: {
        requestId: number;
        errorCode: ErrorCode;
    }) {
        const response = new GenericResponse();
        protocolUtils.loadJson(response, data);
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new GenericResponse();
        protocolUtils.bufferLoaderHelper(response, buffer, 8, (smartBuffer: SmartBuffer) => {
            response.data.packetLength = 8;
            response.data.requestId = smartBuffer.readUInt32LE(); // request_id
            response.data.errorCode = smartBuffer.readUInt32LE(); // error_code
        });
        return response;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        smartBuffer.writeUInt32LE(this.data.requestId); // request_id
        smartBuffer.writeUInt32LE(this.data.errorCode); // error_code
        this.data.packetLength = smartBuffer.writeOffset;
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        //this response doesn't actually contain packetLength, but we need to add it here just to make this response look like a regular response
        packetLength: undefined as number,
        requestId: Number.MAX_SAFE_INTEGER,
        errorCode: undefined as ErrorCode
    };
}
