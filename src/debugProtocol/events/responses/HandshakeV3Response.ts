import { SmartBuffer } from 'smart-buffer';
import * as semver from 'semver';
import type { ProtocolResponse } from '../ProtocolEvent';
import { protocolUtil } from '../../ProtocolUtil';
import { ErrorCode } from '../../Constants';
import { HandshakeRequest } from '../requests/HandshakeRequest';

export class HandshakeV3Response implements ProtocolResponse {

    public static fromJson(data: {
        magic: string;
        protocolVersion: string;
        revisionTimestamp: Date;
    }) {
        const response = new HandshakeV3Response();
        protocolUtil.loadJson(response, data);
        // We only support v3 or above with this handshake
        if (semver.satisfies(response.data.protocolVersion, '<3.0.0')) {
            response.success = false;
        }
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new HandshakeV3Response();
        protocolUtil.bufferLoaderHelper(response, buffer, 20, (smartBuffer: SmartBuffer) => {
            response.data.magic = protocolUtil.readStringNT(smartBuffer); // magic_number

            response.data.protocolVersion = [
                smartBuffer.readUInt32LE(), // protocol_major_version
                smartBuffer.readUInt32LE(), // protocol_minor_version
                smartBuffer.readUInt32LE() //  protocol_patch_version
            ].join('.');

            const legacyReadSize = smartBuffer.readOffset;
            const remainingPacketLength = smartBuffer.readInt32LE(); // remaining_packet_length

            const requiredBufferSize = remainingPacketLength + legacyReadSize;
            response.data.revisionTimestamp = new Date(Number(smartBuffer.readBigUInt64LE())); // platform_revision_timestamp

            if (smartBuffer.length < requiredBufferSize) {
                throw new Error(`Missing buffer data according to the remaining packet length: ${smartBuffer.length}/${requiredBufferSize}`);
            }
            //set the buffer offset
            smartBuffer.readOffset = requiredBufferSize;

            // We only support v3.0.0 or above with this handshake
            if (semver.satisfies(response.data.protocolVersion, '<3.0.0')) {
                throw new Error(`unsupported version ${response.data.protocolVersion}`);
            }
        });
        return response;
    }

    /**
     * Convert the data into a buffer
     */
    public toBuffer() {
        let smartBuffer = new SmartBuffer();
        smartBuffer.writeStringNT(this.data.magic); // magic_number
        const [major, minor, patch] = (this.data.protocolVersion?.split('.') ?? ['0', '0', '0']).map(x => parseInt(x));
        smartBuffer.writeUInt32LE(major); // protocol_major_version
        smartBuffer.writeUInt32LE(minor); // protocol_minor_version
        smartBuffer.writeUInt32LE(patch); // protocol_patch_version

        //As of BrightScript debug protocol 3.0.0 (Roku OS 11.0), all packets from the debugging target include a packet_length.
        //The length is always in bytes, and includes the packet_length field, itself.
        //This field avoids the need for changes to the major version of the protocol because it allows a debugger client to
        //read past data it does not understand and is not critical to debugger operations.
        const remainingDataBuffer = new SmartBuffer();
        remainingDataBuffer.writeBigInt64LE(BigInt(
            this.data.revisionTimestamp.getTime()
        )); // platform_revision_timestamp

        smartBuffer.writeUInt32LE(remainingDataBuffer.writeOffset + 4); // remaining_packet_length
        smartBuffer.writeBuffer(remainingDataBuffer.toBuffer());

        return smartBuffer.toBuffer();
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
        /**
         * A platform-specific implementation timestamp (in milliseconds since epoch [1970-01-01T00:00:00.000Z]).
         *
         * As of BrightScript debug protocol 3.0.0 (Roku OS 11.0), a timestamp is sent to the debugger client in the initial handshake.
         * This timestamp is platform-specific data that is included in the system software of the platform being debugged.
         * It is changed by the platform's vendor when there is any change that affects the behavior of the debugger.
         *
         * The value can be used in manners similar to a build number, and is primarily used to differentiate between pre-release builds of the platform being debugged.
         */
        revisionTimestamp: undefined as Date,


        //The handshake response isn't actually structured like like normal responses, but since they're the only unique response, just add dummy data for those fields
        packetLength: undefined as number,
        //hardcode the max uint32 integer value. This must be the same value as the HandshakeRequest class
        requestId: HandshakeRequest.REQUEST_ID,
        errorCode: ErrorCode.OK
    };
}
