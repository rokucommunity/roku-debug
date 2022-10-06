import { SmartBuffer } from 'smart-buffer';
import { util } from '../../util';
import { ProtocolRequest } from './ProtocolRequest';

export class HandshakeRequestV3 extends ProtocolRequest {

    public constructor(arg: Buffer | HandshakeRequestV3) {
        super();
        if (Buffer.isBuffer(arg)) {
            this.loadBuffer(arg);
        } else {
            this.loadJson(arg.data);
        }
    }

    loadJson(data: HandshakeRequestV3['data']) {
        this.data.magic = data.magic;
        this.success = true;
    }

    loadBuffer(buffer: Buffer) {
        this.data.magic = util.readStringNT(SmartBuffer.fromBuffer(buffer));
        this.success = true;
    }

    toBuffer() {
        return new SmartBuffer({
            size: Buffer.byteLength(this.data.magic) + 1
        }).writeStringNT(this.data.magic).toBuffer();
    }

    public data = {
        magic: undefined as string
    };
}
