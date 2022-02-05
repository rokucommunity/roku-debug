import { SmartBuffer } from 'smart-buffer';
import type { ERROR_CODES, UPDATE_TYPES } from '../Constants';


interface Handshake {
    magic: string;
    major: number;
    minor: number;
    patch: number;
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

interface ProtocolEvent {
    requestId: number;
    errorCode: ERROR_CODES;
    updateType?: UPDATE_TYPES;
}

export function createProtocolEvent(protocolEvent: ProtocolEvent, extraBufferData?: Buffer): SmartBuffer {
    let buffer = new SmartBuffer();
    buffer.writeUInt32LE(protocolEvent.requestId); // request_id
    buffer.writeUInt32LE(protocolEvent.errorCode); // error_code

    // If this is an update type make sure to add the update type value
    if (protocolEvent.requestId === 0) {
        buffer.writeInt32LE(protocolEvent.updateType); // update_type
    }

    // write any extra data for testing
    if (extraBufferData) {
        buffer.writeBuffer(extraBufferData);
    }

    return buffer;
}

export function createProtocolEventV3(protocolEvent: ProtocolEvent, extraBufferData?: Buffer): SmartBuffer {
    let buffer = new SmartBuffer();
    buffer.writeUInt32LE(protocolEvent.requestId); // request_id
    buffer.writeUInt32LE(protocolEvent.errorCode); // error_code

    // If this is an update type make sure to add the update type value
    if (protocolEvent.requestId === 0) {
        buffer.writeInt32LE(protocolEvent.updateType); // update_type
    }

    // write any extra data for testing
    if (extraBufferData) {
        buffer.writeBuffer(extraBufferData);
    }

    return addPacketLength(buffer);
}

function addPacketLength(buffer: SmartBuffer): SmartBuffer {
    return buffer.insertUInt32LE(buffer.length + 4, 0); // packet_length - The size of the packet to be sent.
}
