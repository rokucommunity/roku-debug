import { SmartBuffer } from 'smart-buffer';
import { COMMANDS } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class ListBreakpointsRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number }) {
        const request = new ListBreakpointsRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new ListBreakpointsRequest();
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

    public readOffset = -1;

    public data = {
        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        commandCode: COMMANDS.LIST_BREAKPOINTS
    };
}
