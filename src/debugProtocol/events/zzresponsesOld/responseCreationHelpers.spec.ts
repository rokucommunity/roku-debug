/* eslint-disable @typescript-eslint/no-loop-func */
/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, UPDATE_TYPES, VARIABLE_FLAGS, VARIABLE_TYPES } from '../../Constants';
import type { BreakpointInfo } from '../responses/ListBreakpointsResponse';

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
        writeIfSet(breakpoint.id, x => buffer.writeUInt32LE(x));
        writeIfSet(breakpoint.errorCode, x => buffer.writeUInt32LE(x));
        writeIfSet(breakpoint.hitCount, x => buffer.writeUInt32LE(x));
    }

    // write any extra data for testing
    writeIfSet(params.extraBufferData, x => buffer.writeBuffer(x));

    return addPacketLength(buffer);
}

interface Variable {
    variableType: VARIABLE_TYPES;
    name: string;
    flags?: number;
    refCount: number;
    isConst: boolean;
    children?: Variable[];
    value: any;
    keyType?: VARIABLE_TYPES;
}

export function createVariableResponse(params: {
    requestId?: number; variables?: Variable[]; errorCode?: number; extraBufferData?: Buffer; includePacketLength?: boolean;
}): SmartBuffer {
    let buffer = new SmartBuffer();

    writeIfSet(params.requestId, x => buffer.writeUInt32LE(x));
    writeIfSet(params.errorCode, x => buffer.writeUInt32LE(x));

    const variables = [...params.variables];
    for (let i = 0; i < variables.length; i++) {
        const variable = variables[i];
        if (variable.children) {
            variables.splice(i + 1, 0, ...variable.children);
        }
    }

    writeIfSet(variables?.length, x => buffer.writeUInt32LE(x));

    while (variables.length > 0) {
        const variable = variables.shift();
        let flags = 0;
        if (variable.isConst) {
            flags |= VARIABLE_FLAGS.isConst;
        }
        if (variable.children) {
            flags |= VARIABLE_FLAGS.isContainer;
        }
        if (variable.name !== undefined) {
            flags |= VARIABLE_FLAGS.isNameHere;
        }
        if (variable.refCount !== undefined) {
            flags |= VARIABLE_FLAGS.isRefCounted;
        }
        if (variable.value !== undefined) {
            flags |= VARIABLE_FLAGS.isValueHere;
        }
        buffer.writeUInt8(flags); //flags
        writeIfSet(variable.variableType, x => buffer.writeUInt8(x)); //variable_type
        writeIfSet(variable.name, x => buffer.writeStringNT(variable.name));
        if (variable.refCount !== undefined) {
            writeIfSet(variable.refCount, x => buffer.writeUInt32LE(variable.refCount));
        }
        if (variable.children) {
            for (const child of variable.children) {
                child.flags = (child.flags ?? 0) | VARIABLE_FLAGS.isChildKey;
            }
            writeIfSet(variable.keyType, x => buffer.writeUInt8(variable.keyType));
            //element_count
            writeIfSet(variable.children.length, x => buffer.writeUInt32LE(variable.keyType));
        }

        switch (variable.variableType) {
            case VARIABLE_TYPES.Interface:
            case VARIABLE_TYPES.Object:
            case VARIABLE_TYPES.String:
            case VARIABLE_TYPES.Subroutine:
            case VARIABLE_TYPES.Function:
                buffer.writeStringNT(variable.value);
                break;
            case VARIABLE_TYPES.Subtyped_Object:
                buffer.writeStringNT(variable.value[0]);
                buffer.writeStringNT(variable.value[1]);
                break;
            case VARIABLE_TYPES.Boolean:
                buffer.writeUInt8(variable.value ? 1 : 0);
                break;
            case VARIABLE_TYPES.Double:
                buffer.writeDoubleLE(variable.value);
                break;
            case VARIABLE_TYPES.Float:
                buffer.writeFloatLE(variable.value);
                break;
            case VARIABLE_TYPES.Integer:
                buffer.writeInt32LE(variable.value);
                break;
            case VARIABLE_TYPES.Long_Integer:
                buffer.writeBigInt64LE(variable.value);
                break;
            default:
                //nothing to write
                break;
        }
    }

    if (params.includePacketLength) {
        buffer = addPacketLength(buffer);
    }
    return buffer;
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
