import type { COMMANDS, UPDATE_TYPES } from '../Constants';

export interface ProtocolEvent<TData> {
    /**
     * Was this event successful in parsing/ingesting the data in its constructor
     */
    success: boolean;

    /**
     * The number of bytes that were read from a buffer if this was a success
     */
    readOffset: number;

    /**
     * Serialize this event into Convert the current object into the debug protocol binary format,
     * stored in a `Buffer`
     */
    toBuffer(): Buffer;

    /**
     * Contains the actual event data
     */
    data: TData;
}

/**
 * The fields that every ProtocolRequest must have
 */
export interface ProtocolRequestData {
    //common props
    packetLength: number;
    requestId: number;
    commandCode: COMMANDS;
}
export type ProtocolRequest<TData extends ProtocolRequestData = ProtocolRequestData> = ProtocolEvent<TData>;

/**
 * The fields that every ProtocolUpdateResponse must have
 */
export interface ProtocolUpdateData {
    packetLength: number;
    requestId: number;
    errorCode: number;
    updateType: UPDATE_TYPES;
}
export type ProtocolUpdate<TData extends ProtocolUpdateData = ProtocolUpdateData> = ProtocolEvent<TData>;

/**
 * The fields that every ProtocolResponse must have
 */
export interface ProtocolResponseData {
    packetLength: number;
    requestId: number;
    errorCode: number;
}
export type ProtocolResponse<TData extends ProtocolResponseData = ProtocolResponseData> = ProtocolEvent<TData>;

