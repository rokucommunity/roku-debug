import { SmartBuffer } from 'smart-buffer';
import * as semver from 'semver';
import { util } from '../../util';

export class HandshakeResponse {

    constructor(buffer: Buffer) {
        // Required size of the handshake
        if (buffer.byteLength >= 20) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.magic = util.readStringNT(bufferReader); // magic_number
                this.majorVersion = bufferReader.readInt32LE(); // protocol_major_version
                this.minorVersion = bufferReader.readInt32LE(); // protocol_minor_version
                this.patchVersion = bufferReader.readInt32LE(); // protocol_patch_version
                this.readOffset = bufferReader.readOffset;

                const versionString = [this.majorVersion, this.minorVersion, this.patchVersion].join('.');

                // We only support version prior to v3 with this handshake
                if (!semver.satisfies(versionString, '<3.0.0')) {
                    throw new Error(`unsupported version ${versionString}`);
                }
                this.success = true;
            } catch (error) {
                // Could not parse
            }
        }
    }

    public watchPacketLength = false; // this will always be false for older protocol versions
    public success = false;
    public readOffset = 0;

    // response fields
    public magic: string;
    public majorVersion = -1;
    public minorVersion = -1;
    public patchVersion = -1;
}
