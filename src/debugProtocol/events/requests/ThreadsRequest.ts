import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class ThreadsRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number, threads_request_flags?: number }) {
        const request = new ThreadsRequest();
        protocolUtil.loadJson(request, data);
        if (data.threads_request_flags !== undefined) {
            request.data.threads_request_flags = data.threads_request_flags;
        }
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new ThreadsRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);
            if (smartBuffer.remaining() >= 4) {
                request.data.threads_request_flags = smartBuffer.readUInt32LE();
            }
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();
        if (this.data.threads_request_flags !== undefined) {
            smartBuffer.writeUInt32LE(this.data.threads_request_flags);
        }
        protocolUtil.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data: {
        packetLength: number;
        requestId: number;
        command: Command;
        threads_request_flags?: number; 
    } = {
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.Threads,
    };
}

export enum ThreadRequestFlags {
    includeThreadInfo = 0x0001
}