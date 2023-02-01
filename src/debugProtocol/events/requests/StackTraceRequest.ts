import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class StackTraceRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number; threadIndex: number }) {
        const request = new StackTraceRequest();
        protocolUtil.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new StackTraceRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);
            request.data.threadIndex = smartBuffer.readUInt32LE(); //thread_index
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.threadIndex); //thread_index

        protocolUtil.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        threadIndex: undefined as number,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.StackTrace
    };
}

