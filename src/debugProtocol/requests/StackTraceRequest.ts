import { SmartBuffer } from 'smart-buffer';
import type { CommandData, STEP_TYPE } from '../Constants';
import { COMMANDS } from '../Constants';
import { protocolUtils } from '../ProtocolUtil';
import type { ProtocolRequest } from './ProtocolRequest';

export class StackTraceRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number; threadIndex: number }) {
        const request = new StackTraceRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new StackTraceRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);
            request.data.threadIndex = smartBuffer.readUInt32LE(); //thread_index
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.threadIndex); //thread_index

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        threadIndex: undefined as number,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        commandCode: COMMANDS.STACKTRACE
    };
}

