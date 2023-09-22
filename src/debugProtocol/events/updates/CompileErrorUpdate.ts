import { SmartBuffer } from 'smart-buffer';
import { ErrorCode, UpdateType } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';

/**
 * A COMPILE_ERROR is sent if a compilation error occurs. In this case, the update_type field in a DebuggerUpdate message is set to
 * COMPILE_ERROR, and the data field contains a structure named CompileErrorUpdateData that provides the reason for the error.
 * The CompileErrorUpdateData structure has the following syntax:
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
export class CompileErrorUpdate {

    public static fromJson(data: {
        errorMessage: string;
        filePath: string;
        lineNumber: number;
        libraryName: string;
    }) {
        const update = new CompileErrorUpdate();
        protocolUtil.loadJson(update, data);
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new CompileErrorUpdate();
        protocolUtil.bufferLoaderHelper(update, buffer, 20, (smartBuffer) => {
            protocolUtil.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);
            update.data.flags = smartBuffer.readUInt32LE(); // flags - always 0, reserved for future use
            update.data.errorMessage = protocolUtil.readStringNT(smartBuffer); // error_string
            update.data.filePath = protocolUtil.readStringNT(smartBuffer); // file_spec
            update.data.lineNumber = smartBuffer.readUInt32LE(); // line_number
            update.data.libraryName = protocolUtil.readStringNT(smartBuffer); // library_name
        });
        return update;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.flags ?? 0); // flags
        smartBuffer.writeStringNT(this.data.errorMessage); // error_string
        smartBuffer.writeStringNT(this.data.filePath); // file_spec
        smartBuffer.writeUInt32LE(this.data.lineNumber); // line_number
        smartBuffer.writeStringNT(this.data.libraryName); // library_name

        protocolUtil.insertCommonUpdateFields(this, smartBuffer);

        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        flags: undefined as number,
        /**
         * A text message describing the compiler error.
         *
         * This is completely unrelated to the DebuggerUpdate.errorCode field.
         */
        errorMessage: undefined as string,
        /**
         * A simple file path indicating where the compiler error occurred. It maps to all matching file paths in the channel or its libraries
         *
         * `"pkg:/"` specifies a file in the channel
         *
         * `"lib:/<library_name>/"` specifies a file in a library.
         */
        filePath: undefined as string,
        /**
         * The 1-based line number where the compile error occurred.
         */
        lineNumber: undefined as number,
        /**
         * The name of the library where the compile error occurred.
         */
        libraryName: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ErrorCode.OK,
        updateType: UpdateType.CompileError
    };
}
