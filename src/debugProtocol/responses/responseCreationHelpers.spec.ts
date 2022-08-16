import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, UPDATE_TYPES } from '../Constants';
import type { BreakpointInfo } from './ListBreakpointsResponse';

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

/**
 * Add packetLength to the beginning of the buffer
 */
function addPacketLength(buffer: SmartBuffer): SmartBuffer {
    return buffer.insertUInt32LE(buffer.length + 4, 0); // packet_length - The size of the packet to be sent.
}

/**
 * Create a buffer for `ListBreakpointsResponse`
 */
export function createListBreakpointsResponse(params: { requestId?: number; errorCode?: number; num_breakpoints?: number; breakpoints?: Partial<BreakpointInfo>[]; extraBufferData?: Buffer }): SmartBuffer {
    let buffer = new SmartBuffer();

    writeIfSet(params.requestId, x => buffer.writeUInt32LE(x));
    writeIfSet(params.errorCode, x => buffer.writeUInt32LE(x));

    buffer.writeUInt32LE(params.num_breakpoints ?? params.breakpoints?.length ?? 0); // num_breakpoints
    for (const breakpoint of params?.breakpoints ?? []) {
        writeIfSet(breakpoint.breakpointId, x => buffer.writeUInt32LE(x));
        writeIfSet(breakpoint.errorCode, x => buffer.writeUInt32LE(x));
        writeIfSet(breakpoint.hitCount, x => buffer.writeUInt32LE(x));
    }

    // write any extra data for testing
    writeIfSet(params.extraBufferData, x => buffer.writeBuffer(x));

    return addPacketLength(buffer);
}

/**
 * Contains a list of breakpoint errors
 */
export function createBreakpointErrorUpdateResponse(params: { errorCode?: number; flags?: number; breakpoint_id?: number; compile_errors?: string[]; runtime_errors?: string[]; other_errors?: string[]; extraBufferData?: Buffer; includePacketLength?: boolean }): SmartBuffer {
    let buffer = new SmartBuffer();

    writeIfSet(0, x => buffer.writeUInt32LE(x)); //request_id
    writeIfSet(ERROR_CODES.OK, x => buffer.writeUInt32LE(x)); //error_code
    writeIfSet(UPDATE_TYPES.BREAKPOINT_ERROR, x => buffer.writeUInt32LE(x)); //update_type

    writeIfSet(params.flags, x => buffer.writeUInt32LE(x)); //flags

    writeIfSet(params.breakpoint_id, x => buffer.writeUInt32LE(x)); //breakpoint_id

    writeIfSet(params.compile_errors?.length, x => buffer.writeUInt32LE(x));
    for (const error of params.compile_errors ?? []) {
        buffer.writeStringNT(error);
    }

    writeIfSet(params.runtime_errors?.length, x => buffer.writeUInt32LE(x));
    for (const error of params.runtime_errors ?? []) {
        buffer.writeStringNT(error);
    }

    writeIfSet(params.other_errors?.length, x => buffer.writeUInt32LE(x));
    for (const error of params.other_errors ?? []) {
        buffer.writeStringNT(error);
    }

    // write any extra data for testing
    writeIfSet(params.extraBufferData, x => buffer.writeBuffer(x));

    if (params.includePacketLength) {
        buffer = addPacketLength(buffer);
    }
    return buffer;
}

/**
 * If the value is undefined or null, skip the callback.
 * All other values will cause the callback to be called
 */
function writeIfSet<T, R>(value: T, writer: (x: T) => R, defaultValue?: T) {
    if (
        //if we have a value
        (value !== undefined && value !== null) ||
        //we don't have a value, but we have a default value
        (defaultValue !== undefined && defaultValue !== null)
    ) {
        return writer(value);
    }
}

/**
 * Build a buffer of `byteCount` size and fill it with random data
 */
export function getRandomBuffer(byteCount: number) {
    const result = new SmartBuffer();
    for (let i = 0; i < byteCount; i++) {
        result.writeUInt32LE(i);
    }
    return result.toBuffer();
}
