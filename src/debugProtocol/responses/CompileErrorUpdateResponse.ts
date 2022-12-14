import { SmartBuffer } from 'smart-buffer';
import { util } from '../../util';
import { UPDATE_TYPES } from '../Constants';

/**
 * Data sent as the data segment of message type: COMPILE_ERROR
    ```
    struct CompileErrorUpdateData {
        uint32 flags;              // Always 0, reserved for future use
        utf8z  error_string;
        utf8z  file_spec;
        uint32 line_number;
        utf8z  library_name;
    }
    ```
*/
export class CompileErrorUpdateResponse {

    constructor(buffer: Buffer) {
        // The minimum size of a undefined response
        if (buffer.byteLength >= 12) {
            let bufferReader = SmartBuffer.fromBuffer(buffer);
            this.requestId = bufferReader.readUInt32LE();

            // Updates will always have an id of zero because we didn't ask for this information
            if (this.requestId === 0) {
                this.errorCode = bufferReader.readUInt32LE();
                this.updateType = bufferReader.readUInt32LE();
            }
            if (this.updateType === UPDATE_TYPES.COMPILE_ERROR) {
                try {
                    this.flags = bufferReader.readUInt32LE(); // flags - always 0, reserved for future use
                    this.message = util.readStringNT(bufferReader); // error_string
                    this.filePath = util.readStringNT(bufferReader); // file_spec
                    this.lineNumber = bufferReader.readUInt32LE(); //line_number
                    this.libraryName = util.readStringNT(bufferReader); //library_name

                } catch (error) {
                    // Could not process
                }
            }
        }
    }
    public success = false;
    public readOffset = 0;
    public requestId = -1;
    public errorCode = -1;
    public updateType = -1;

    public flags: number;

    /**
     * The message for this compile error
     */
    public message: string;
    /**
     * The file path where the compile error occurred. (in the form `/source/file.brs` or `/components/a/b/c.xml`)
     */
    public filePath: string;
    /**
     * The 1-based line number where the compile error occurred
     */
    public lineNumber: number;
    /**
     * The name of the library where this compile error occurred. (is empty string if for the main app)
     */
    public libraryName: string;
}
