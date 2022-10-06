import { SmartBuffer } from 'smart-buffer';

export abstract class ProtocolResponse<TData = any> {
    /**
     * Was this class successful in parsing/ingesting the data in its constructor
     */
    public success = false;

    /**
     * The number of bytes that were read from a buffer if this was a success
     */
    public readOffset: number;

    /**
     * Convert the current object into the debug protocol binary format,
     * stored in a `Buffer`
     */
    public abstract toBuffer(): Buffer;

    /**
     * Contains the actual response data
     */
    public data: TData;

    /**
     * Helper function for buffer loading.
     * Handles things like try/catch, setting buffer read offset, etc
     */
    protected bufferLoaderHelper(buffer: Buffer, minByteLength: number, processor: (buffer: SmartBuffer) => boolean) {
        // Required size of this processor
        if (buffer.byteLength >= minByteLength) {
            try {
                let smartBuffer = SmartBuffer.fromBuffer(buffer);

                //have the processor consume the requred bytes
                this.success = processor(smartBuffer);

                this.readOffset = smartBuffer.readOffset;
                this.success = true;
            } catch (error) {
                // Could not parse
                this.readOffset = 0;
                this.success = true;
            }
        }
    }
}
