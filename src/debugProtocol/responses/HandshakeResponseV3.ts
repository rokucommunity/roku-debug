import { SmartBuffer } from 'smart-buffer';
import * as semver from 'semver';
import { util } from '../../util';

export class HandshakeResponseV3 {

    constructor(buffer: Buffer) {
        // Required size of the handshake
        if (buffer.byteLength >= 20) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.magic = util.readStringNT(bufferReader); // magic_number
                this.majorVersion = bufferReader.readInt32LE(); // protocol_major_version
                this.minorVersion = bufferReader.readInt32LE(); // protocol_minor_version
                this.patchVersion = bufferReader.readInt32LE(); // protocol_patch_version

                const legacyReadSize = bufferReader.readOffset;
                this.remainingPacketLength = bufferReader.readInt32LE(); // remaining_packet_length

                const requiredBufferSize = this.remainingPacketLength + legacyReadSize;
                this.revisionTimeStamp = new Date(Number(bufferReader.readBigUInt64LE())); // platform_revision_timestamp

                if (bufferReader.length < requiredBufferSize) {
                    throw new Error(`Missing buffer data according to the remaining packet length: ${bufferReader.length}/${requiredBufferSize}`);
                }
                this.readOffset = requiredBufferSize;

                const versionString = [this.majorVersion, this.minorVersion, this.patchVersion].join('.');

                // We only support v3 or above with this handshake
                if (!semver.satisfies(versionString, '>=3.0.0')) {
                    throw new Error(`unsupported version ${versionString}`);
                }
                this.success = true;
            } catch (error) {
                // Could not parse
            }
        }
    }

    public watchPacketLength = true; // this will always be false for the new protocol versions
    public success = false;
    public readOffset = 0;

    // response fields
    public magic: string;
    public majorVersion = -1;
    public minorVersion = -1;
    public patchVersion = -1;
    public remainingPacketLength = -1;
    public revisionTimeStamp: Date;
}
