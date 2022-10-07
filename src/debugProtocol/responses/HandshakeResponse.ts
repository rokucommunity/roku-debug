import { SmartBuffer } from 'smart-buffer';
import * as semver from 'semver';
import { util } from '../../util';
import { ProtocolResponse } from './ProtocolResponse';

export class HandshakeResponse extends ProtocolResponse {

    public constructor(json: HandshakeResponse['data']);
    public constructor(buffer: Buffer);
    public constructor(arg: Buffer | HandshakeResponse['data']) {
        super();
        if (Buffer.isBuffer(arg)) {
            this.loadFromBuffer(arg);
        } else {
            this.loadJson(arg);
        }
    }

    loadFromBuffer(buffer: Buffer) {
        this.bufferLoaderHelper(buffer, 20, null, (smartBuffer: SmartBuffer) => {
            this.data.magic = util.readStringNT(smartBuffer); // magic_number
            this.data.majorVersion = smartBuffer.readInt32LE(); // protocol_major_version
            this.data.minorVersion = smartBuffer.readInt32LE(); // protocol_minor_version
            this.data.patchVersion = smartBuffer.readInt32LE(); // protocol_patch_version

            // We only support version prior to v3 with this handshake
            if (!semver.satisfies(this.getVersion(), '<3.0.0')) {
                throw new Error(`unsupported version ${this.getVersion()}`);
            }
            return true;
        });
    }

    protected loadJson(data: HandshakeResponse['data']) {
        this.data = data;
        this.success = true;
    }

    public toBuffer() {
        let buffer = new SmartBuffer();
        buffer.writeStringNT(this.data.magic); // magic_number
        buffer.writeUInt32LE(this.data.majorVersion); // protocol_major_version
        buffer.writeUInt32LE(this.data.minorVersion); // protocol_minor_version
        buffer.writeUInt32LE(this.data.patchVersion); // protocol_patch_version

        return buffer.toBuffer();
    }

    public watchPacketLength = false; // this will always be false for older protocol versions
    public success = false;
    public readOffset = 0;
    public requestId = 0;

    getVersion() {
        return [this.data.majorVersion, this.data.minorVersion, this.data.patchVersion].join('.');
    }

    public data = {
        /**
         * The Roku Brightscript debug protocol identifier, which is the following 64-bit value :0x0067756265647362LU.
         *
         * This is equal to 29120988069524322LU or the following little-endian value: b'bsdebug\0.
         */
        magic: undefined as string,
        majorVersion: -1,
        minorVersion: -1,
        patchVersion: -1
    };
}
