import { SmartBuffer } from 'smart-buffer';
import { ErrorCode, UpdateType } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';

/**
 * Data sent as the data segment of message type: BREAKPOINT_ERROR
    ```
    struct BreakpointErrorUpdateData {
        uint32                    flags;              // Always 0, reserved for future use
        uint32                    breakpoint_id;
        uint32                    num_compile_errors;
        utf8z[num_compile_errors] compile_errors;
        uint32                    num_runtime_errors;
        utf8z[num_runtime_errors] runtime_errors;
        uint32                    num_other_errors;   // E.g., permissions errors
        utf8z[num_other_errors]   other_errors;
    }
    ```
*/
export class ExceptionBreakpointErrorUpdate {

    public static fromJson(data: {
        filterId: number;
        compileErrors: string[];
        runtimeErrors: string[];
        otherErrors: string[];
        lineNumber: number;
        filePath: string;
    }) {
        const update = new ExceptionBreakpointErrorUpdate();
        protocolUtil.loadJson(update, data);
        update.data.compileErrors ??= [];
        update.data.runtimeErrors ??= [];
        update.data.otherErrors ??= [];
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new ExceptionBreakpointErrorUpdate();
        protocolUtil.bufferLoaderHelper(update, buffer, 20, (smartBuffer) => {
            protocolUtil.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);

            smartBuffer.readUInt32LE(); // flags - always 0, reserved for future use
            update.data.filterId = smartBuffer.readUInt32LE(); // filter_id

            const compileErrorCount = smartBuffer.readUInt32LE(); // num_compile_errors
            update.data.compileErrors = [];
            for (let i = 0; i < compileErrorCount; i++) {
                update.data.compileErrors.push(
                    protocolUtil.readStringNT(smartBuffer)
                );
            }

            const runtimeErrorCount = smartBuffer.readUInt32LE(); // num_runtime_errors
            update.data.runtimeErrors = [];
            for (let i = 0; i < runtimeErrorCount; i++) {
                update.data.runtimeErrors.push(
                    protocolUtil.readStringNT(smartBuffer)
                );
            }

            const otherErrorCount = smartBuffer.readUInt32LE(); // num_other_errors
            update.data.otherErrors = [];
            for (let i = 0; i < otherErrorCount; i++) {
                update.data.otherErrors.push(
                    protocolUtil.readStringNT(smartBuffer)
                );
            }

            update.data.lineNumber = smartBuffer.readInt32LE(); // line_number

            update.data.filePath = protocolUtil.readStringNT(smartBuffer); //file_path
        });
        return update;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeInt32LE(0); // flags - always 0, reserved for future use
        smartBuffer.writeUInt32LE(this.data.filterId); // filter_id

        smartBuffer.writeUInt32LE(this.data.compileErrors?.length ?? 0); // num_compile_errors
        for (let error of this.data.compileErrors ?? []) {
            smartBuffer.writeStringNT(error);
        }

        smartBuffer.writeUInt32LE(this.data.runtimeErrors?.length ?? 0); // num_runtime_errors
        for (let error of this.data.runtimeErrors ?? []) {
            smartBuffer.writeStringNT(error);
        }

        smartBuffer.writeUInt32LE(this.data.otherErrors?.length ?? 0); // num_other_errors
        for (let error of this.data.otherErrors ?? []) {
            smartBuffer.writeStringNT(error);
        }

        smartBuffer.writeInt32LE(this.data.lineNumber); // line_number

        smartBuffer.writeStringNT(this.data.filePath); //file_path

        protocolUtil.insertCommonUpdateFields(this, smartBuffer);

        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        filterId: undefined as number,
        compileErrors: undefined as string[],
        runtimeErrors: undefined as string[],
        otherErrors: undefined as string[],
        lineNumber: undefined as number,
        filePath: undefined as string,

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ErrorCode.OK,
        updateType: UpdateType.BreakpointError
    };
}
