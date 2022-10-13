import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class StopRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number }) {
        const request = new StopRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new StopRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();
        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset: number = undefined;

    public data = {
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.Stop
    };
}
