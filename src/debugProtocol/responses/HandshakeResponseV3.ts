import { SmartBuffer } from 'smart-buffer';
import * as semver from 'semver';
import { util } from '../../util';
import { ProtocolResponse } from './ProtocolResponse';

export class HandshakeResponseV3 extends ProtocolResponse {

    public constructor(json: HandshakeResponseV3['data']);
    public constructor(buffer: Buffer);
    public constructor(arg: Buffer | HandshakeResponseV3['data']) {
        super();
        if (Buffer.isBuffer(arg)) {
            this.loadFromBuffer(arg);
        } else {
            this.loadJson(arg);
        }
    }

    private loadFromBuffer(buffer: Buffer) {
        this.bufferLoaderHelper(buffer, 20, null, (smartBuffer: SmartBuffer) => {
            this.data.magic = util.readStringNT(smartBuffer); // debugger_magic
            this.data.majorVersion = smartBuffer.readInt32LE(); // protocol_major_version
            this.data.minorVersion = smartBuffer.readInt32LE(); // protocol_minor_version
            this.data.patchVersion = smartBuffer.readInt32LE(); // protocol_patch_version

            const legacyReadSize = smartBuffer.readOffset;
            const remainingPacketLength = smartBuffer.readInt32LE(); // remaining_packet_length

            const requiredBufferSize = remainingPacketLength + legacyReadSize;
            this.data.revisionTimeStamp = new Date(Number(smartBuffer.readBigUInt64LE())); // platform_revision_timestamp

            if (smartBuffer.length < requiredBufferSize) {
                throw new Error(`Missing buffer data according to the remaining packet length: ${smartBuffer.length}/${requiredBufferSize}`);
            }
            //set the buffer offset
            smartBuffer.readOffset = requiredBufferSize;

            // We only support v3 or above with this handshake
            if (!semver.satisfies(this.getVersion(), '>=3.0.0')) {
                throw new Error(`unsupported version ${this.getVersion()}`);
            }
            this.watchPacketLength = true;
        });
    }

    protected loadJson(data: HandshakeResponseV3['data']) {
        super.loadJson(data);
        this.watchPacketLength = true;
    }

    /**
     * Convert the data into a buffer
     */
    public toBuffer() {
        let buffer = new SmartBuffer();
        buffer.writeStringNT(this.data.magic); // magic_number
        buffer.writeUInt32LE(this.data.majorVersion); // protocol_major_version
        buffer.writeUInt32LE(this.data.minorVersion); // protocol_minor_version
        buffer.writeUInt32LE(this.data.patchVersion); // protocol_patch_version

        //As of BrightScript debug protocol 3.0.0 (Roku OS 11.0), all packets from the debugging target include a packet_length.
        //The length is always in bytes, and includes the packet_length field, itself.
        //This field avoids the need for changes to the major version of the protocol because it allows a debugger client to
        //read past data it does not understand and is not critical to debugger operations.
        const remainingDataBuffer = new SmartBuffer();
        remainingDataBuffer.writeBigInt64LE(BigInt(
            this.data.revisionTimeStamp.getTime()
        )); // platform_revision_timestamp

        buffer.writeUInt32LE(remainingDataBuffer.writeOffset + 4); // remaining_packet_length
        buffer.writeBuffer(remainingDataBuffer.toBuffer());

        return buffer.toBuffer();
    }

    public watchPacketLength = false; // this will always be true for the new protocol versions
    public success = false;
    public readOffset = 0;
    public requestId = 0;

    public getVersion() {
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
        patchVersion: -1,
        /**
         * A platform-specific implementation timestamp (in milliseconds since epoch [1970-01-01T00:00:00.000Z]).
         *
         * As of BrightScript debug protocol 3.0.0 (Roku OS 11.0), a timestamp is sent to the debugger client in the initial handshake. This timestamp is platform-specific data that is included in the system software of the platform being debugged. It is changed by the platform's vendor when there is any change that affects the behavior of the debugger.
         *
         * The value can be used in manners similar to a build number, and is primarily used to differentiate between pre-release builds of the platform being debugged.
         */
        revisionTimeStamp: undefined as Date
    };
}
