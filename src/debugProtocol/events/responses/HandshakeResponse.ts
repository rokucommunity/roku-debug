import { SmartBuffer } from 'smart-buffer';
import * as semver from 'semver';
import { util } from '../../../util';
import type { ProtocolEvent, ProtocolResponse } from '../ProtocolEvent';
import { protocolUtils } from '../../ProtocolUtil';
import { ERROR_CODES } from '../../Constants';

export class HandshakeResponse implements ProtocolResponse {
    public static fromJson(data: {
        magic: string;
        protocolVersion: string;
    }) {
        const response = new HandshakeResponse();
        protocolUtils.loadJson(response, data);
        // We only support version prior to v3 with this handshake
        if (!semver.satisfies(response.data.protocolVersion, '<3.0.0')) {
            response.success = false;
        }
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new HandshakeResponse();
        protocolUtils.bufferLoaderHelper(response, buffer, 20, (smartBuffer: SmartBuffer) => {
            response.data.magic = util.readStringNT(smartBuffer); // magic_number

            response.data.protocolVersion = [
                smartBuffer.readInt32LE(), // protocol_major_version
                smartBuffer.readInt32LE(), // protocol_minor_version
                smartBuffer.readInt32LE() //  protocol_patch_version
            ].join('.');

            // We only support version prior to v3 with this handshake
            if (!semver.satisfies(response.data.protocolVersion, '<3.0.0')) {
                throw new Error(`unsupported version ${response.data.protocolVersion}`);
            }
            return true;
        });
        return response;
    }

    protected loadJson(data: HandshakeResponse['data']) {
        this.data = data;
        this.success = true;
    }

    public toBuffer() {
        let buffer = new SmartBuffer();
        buffer.writeStringNT(this.data.magic); // magic_number
        const [major, minor, patch] = (this.data.protocolVersion?.split('.') ?? ['0', '0', '0']).map(x => parseInt(x));
        buffer.writeUInt32LE(major); // protocol_major_version
        buffer.writeUInt32LE(minor); // protocol_minor_version
        buffer.writeUInt32LE(patch); // protocol_patch_version

        return buffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        /**
         * The Roku Brightscript debug protocol identifier, which is the following 64-bit value :0x0067756265647362LU.
         *
         * This is equal to 29120988069524322LU or the following little-endian value: b'bsdebug\0.
         */
        magic: undefined as string,
        /**
         * A semantic version string (i.e. `2.0.0`)
         */
        protocolVersion: undefined as string,


        //The handshake response isn't actually structured like like normal responses, but since they're the only unique response, just add dummy data for those fields
        packetLength: undefined as number,
        //hardcode the max integer value. This must be the same value as the HandshakeResponse class
        requestId: Number.MAX_SAFE_INTEGER,
        errorCode: ERROR_CODES.OK
    };
}
