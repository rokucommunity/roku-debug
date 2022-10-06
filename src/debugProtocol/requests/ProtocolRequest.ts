export abstract class ProtocolRequest<TData = any> {
    /**
     * Was this class successful in parsing/ingesting the data in its constructor
     */
    public success = false;

    /**
     * Convert the current object into the debug protocol binary format,
     * stored in a `Buffer`
     */
    public abstract toBuffer(): Buffer;

    /**
     * Contains the actual request data
     */
    public abstract data: any;
}
