import { SmartBuffer } from 'smart-buffer';
import { util } from '../../../util';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';
import type { Command } from '../../Constants';

/**
 * The initial handshake sent by the client. This is just the `magic` to initiate the debug protocol session
 * @since protocol v1.0.0
 */
export class HandshakeRequest implements ProtocolRequest {
    /**
     * A hardcoded id for the handshake classes to help them flow through the request/response flow even though they don't look the same
     */
    public static REQUEST_ID = 4294967295;

    public static fromJson(data: { magic: string }) {
        const request = new HandshakeRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new HandshakeRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 0, (smartBuffer) => {
            request.data.magic = protocolUtils.readStringNT(smartBuffer);
        });
        return request;
    }

    public toBuffer() {
        return new SmartBuffer({
            size: Buffer.byteLength(this.data.magic) + 1
        }).writeStringNT(this.data.magic).toBuffer();
    }

    public success = false;

    public readOffset = undefined;

    public data = {
        magic: undefined as string,

        //handshake requests aren't actually structured like like normal requests, but since they're the only unique type of request,
        //just add dummy data for those fields
        packetLength: undefined as number,
        //hardcode the max integer value. This must be the same value as the HandshakeResponse class
        requestId: HandshakeRequest.REQUEST_ID,
        command: undefined as Command
    };
}
