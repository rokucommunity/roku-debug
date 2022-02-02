import { SmartBuffer } from 'smart-buffer';


interface Handshake {
    magic?: string;
    major?: number;
    minor?: number;
    patch?: number;
}

export function createHandShakeResponse(handshake: Handshake): SmartBuffer {
    let buffer = new SmartBuffer();
    buffer.writeStringNT(handshake.magic); // magic_number
    buffer.writeUInt32LE(handshake.major); // protocol_major_version
    buffer.writeUInt32LE(handshake.minor); // protocol_minor_version
    buffer.writeUInt32LE(handshake.patch); // protocol_patch_version
    return buffer;
}

interface HandshakeV3 {
    magic: string;
    major: number;
    minor: number;
    patch: number;

    // populated by helper.
    // commented out here for the sake of documenting it.
    // remainingPacketLength: number;

    revisionTimeStamp: number;
}

export function createHandShakeResponseV3(handshake: HandshakeV3, extraBufferData?: Buffer): SmartBuffer {
    let buffer = new SmartBuffer();
    buffer.writeStringNT(handshake.magic); // magic_number
    buffer.writeUInt32LE(handshake.major); // protocol_major_version
    buffer.writeUInt32LE(handshake.minor); // protocol_minor_version
    buffer.writeUInt32LE(handshake.patch); // protocol_patch_version

    let timeStampBuffer = new SmartBuffer();
    timeStampBuffer.writeBigInt64LE(BigInt(handshake.revisionTimeStamp)); // platform_revision_timestamp

    buffer.writeUInt32LE(timeStampBuffer.writeOffset + 4 + (extraBufferData ? extraBufferData.length : 0)); // remaining_packet_length
    buffer.writeBuffer(timeStampBuffer.toBuffer());

    if (extraBufferData) {
        buffer.writeBuffer(extraBufferData);
    }

    return buffer;
}

