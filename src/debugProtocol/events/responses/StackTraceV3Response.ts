import { SmartBuffer } from 'smart-buffer';
import { ErrorCode } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';

export class StackTraceV3Response {

    public static fromJson(data: {
        requestId: number;
        entries: StackEntry[];
    }) {
        const response = new StackTraceV3Response();
        protocolUtil.loadJson(response, data);
        response.data.entries ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new StackTraceV3Response();
        protocolUtil.bufferLoaderHelper(response, buffer, 16, (smartBuffer: SmartBuffer) => {
            protocolUtil.loadCommonResponseFields(response, smartBuffer);

            const stackSize = smartBuffer.readUInt32LE(); // stack_size

            response.data.entries = [];

            // build the list of BreakpointInfo
            for (let i = 0; i < stackSize; i++) {
                const entry = {} as StackEntry;
                entry.lineNumber = smartBuffer.readUInt32LE();
                entry.functionName = protocolUtil.readStringNT(smartBuffer);
                entry.filePath = protocolUtil.readStringNT(smartBuffer);

                // TODO do we need this anymore?
                // let fileExtension = path.extname(this.fileName).toLowerCase();
                // // NOTE:Make sure we have a full valid path (?? can be valid because the device might not know the file).
                // entry.success = (fileExtension === '.brs' || fileExtension === '.xml' || this.fileName === '??');
                response.data.entries.push(entry);
            }
        });
        return response;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        smartBuffer.writeUInt32LE(this.data.entries?.length ?? 0); // stack_size
        for (const entry of this.data.entries ?? []) {
            smartBuffer.writeUInt32LE(entry.lineNumber); // line_number
            smartBuffer.writeStringNT(entry.functionName); // function_name
            smartBuffer.writeStringNT(entry.filePath); // file_path
        }
        protocolUtil.insertCommonResponseFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        /**
         * An array of StrackEntry structs. entries[0] contains the last function called;
         * entries[stack_size-1] contains the first function called.
         * Debugging clients may reverse the entries to match developer expectations.
         */
        entries: undefined as StackEntry[],

        // response fields
        packetLength: undefined as number,
        requestId: undefined as number,
        errorCode: ErrorCode.OK
    };

}

export interface StackEntry {
    /**
     * The line number where the stop or failure occurred.
     */
    lineNumber: number;
    /**
     * The function where the stop or failure occurred.
     */
    functionName: string;
    /**
     * The file where the stop or failure occurred.
     */
    filePath: string;
}
