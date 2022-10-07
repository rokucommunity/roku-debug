import type { COMMANDS } from '../Constants';

export interface ProtocolRequest<TData extends HasCommandCode = HasCommandCode> {
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

export interface HasCommandCode {
    commandCode: COMMANDS;
}
