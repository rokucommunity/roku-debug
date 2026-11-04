/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class ThreadsRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number; includeIdentityInfo?: boolean }) {
        const request = new ThreadsRequest();
        protocolUtil.loadJson(request, data);
        //default any missing value to false
        request.data.includeIdentityInfo ??= false;
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new ThreadsRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);
            //the flags field is only present on firmware that supports it; older firmware omits it entirely
            if (smartBuffer.remaining() >= 4) {
                const threadsRequestFlags = smartBuffer.readUInt32LE(); // threads_request_flags
                request.data.includeIdentityInfo = !!(threadsRequestFlags & ThreadRequestFlags.includeIdentityInfo);
            } else {
                request.data.includeIdentityInfo = false;
            }
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();
        //older firmware doesn't expect the flags field at all, so we only include it when configured.
        if (this.data.includeIdentityInfo) {
            let threadsRequestFlags = 0;
            threadsRequestFlags |= this.data.includeIdentityInfo ? ThreadRequestFlags.includeIdentityInfo : 0;
            smartBuffer.writeUInt32LE(threadsRequestFlags); // threads_request_flags
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
        /**
         * Indicates whether the THREADS response should include per-thread identity info
         * (os thread id, name, and type). Only supported on protocol v3.3.0 and above.
         */
        includeIdentityInfo?: boolean;
    } = {
            packetLength: undefined as number,
            requestId: undefined as number,
            command: Command.Threads
        };
}

export enum ThreadRequestFlags {
    includeIdentityInfo = 0x0001
}
