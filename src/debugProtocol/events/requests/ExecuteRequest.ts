import { SmartBuffer } from 'smart-buffer';
import type { RequestData } from '../../Constants';
import { COMMANDS } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class ExecuteRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        threadIndex: number;
        stackFrameIndex: number;
        sourceCode: string;
    }) {
        const request = new ExecuteRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new ExecuteRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);

            request.data.threadIndex = smartBuffer.readUInt32LE(); // thread_index
            request.data.stackFrameIndex = smartBuffer.readUInt32LE(); // stack_frame_index
            request.data.sourceCode = protocolUtils.readStringNT(smartBuffer); // source_code
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.threadIndex); // thread_index
        smartBuffer.writeUInt32LE(this.data.stackFrameIndex); // stack_frame_index
        smartBuffer.writeStringNT(this.data.sourceCode); // source_code

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        threadIndex: undefined as number,
        stackFrameIndex: undefined as number,
        sourceCode: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        commandCode: COMMANDS.EXECUTE
    };
}
