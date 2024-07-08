import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class StopRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number }) {
        const request = new StopRequest();
        protocolUtil.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new StopRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();
        protocolUtil.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.Stop
    };
}
