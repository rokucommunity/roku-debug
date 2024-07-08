import type { Command, UpdateType } from '../Constants';

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
     * Serialize the current object into the debug protocol's binary format,
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
    command: Command;
}
export type ProtocolRequest = ProtocolEvent<ProtocolRequestData>;

/**
 * The fields that every ProtocolUpdateResponse must have
 */
export interface ProtocolUpdateData {
    packetLength: number;
    requestId: number;
    errorCode: number;
    updateType: UpdateType;
}
export type ProtocolUpdate = ProtocolEvent<ProtocolUpdateData>;

/**
 * The fields that every ProtocolResponse must have
 */
export interface ProtocolResponseData {
    packetLength: number;
    requestId: number;
    errorCode: number;
    /**
     * Data included whenever errorCode > 0.
     * @since OS 11.5
     */
    errorData?: ProtocolResponseErrorData;
}
export interface ProtocolResponseErrorData {
    /**
     * The index of the element in the requested path that exists, but has invalid or unknown value.
     * (applies to `VariablesResponse`)
     */
    invalidPathIndex?: number;
    /**
     * The index of the element in path that was not found
     * (applies to `VariablesResponse`)
     */
    missingKeyIndex?: number;
}
export type ProtocolResponse = ProtocolEvent<ProtocolResponseData>;

