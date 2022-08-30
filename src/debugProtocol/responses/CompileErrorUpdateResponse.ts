import { SmartBuffer } from 'smart-buffer';
import { util } from '../../util';
import { UPDATE_TYPES } from '../Constants';

/**
 * Data sent as the data segment of message type: BREAKPOINT_ERROR
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
                    this.errorMessage = util.readStringNT(bufferReader); // error_string
                    this.filePath = util.readStringNT(bufferReader); // file_spec
                    this.lineNumber = bufferReader.readUInt32LE(); // line_number
                    this.libraryName = util.readStringNT(bufferReader); //library_name
                    this.success = true;
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

    /**
     * Currently unused. Reserved for future use
     */
    public flags: number;
    /**
     * The error message
     */
    public errorMessage: string;
    /**
     * The path to the file where the error occurred
     */
    public filePath: string;
    /**
     * The line number where the error occurred (1-based)
     */
    public lineNumber: number;
    /**
     * The name of a component library this error occured in (if applicable). Is empty string if in the main project
     */
    public libraryName: string;
}
