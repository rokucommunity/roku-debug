import { SmartBuffer } from 'smart-buffer';
import { ErrorCode } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { StackEntry } from './StackTraceV3Response';

export class StackTraceResponse {

    public static fromJson(data: {
        requestId: number;
        entries: StackEntry[];
    }) {
        const response = new StackTraceResponse();
        protocolUtils.loadJson(response, data);
        response.data.entries ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new StackTraceResponse();
        protocolUtils.bufferLoaderHelper(response, buffer, 12, (smartBuffer: SmartBuffer) => {
            response.data.requestId = smartBuffer.readUInt32LE(); // request_id
            response.data.errorCode = smartBuffer.readUInt32LE(); // error_code

            const stackSize = smartBuffer.readUInt32LE(); // stack_size

            response.data.entries = [];

            // build the list of BreakpointInfo
            for (let i = 0; i < stackSize; i++) {
                const entry = {} as StackEntry;
                entry.lineNumber = smartBuffer.readUInt32LE();
                // NOTE: this is documented as being function name then file name but it is being returned by the device backwards.
                entry.filePath = protocolUtils.readStringNT(smartBuffer);
                entry.functionName = protocolUtils.readStringNT(smartBuffer);

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
        smartBuffer.writeUInt32LE(this.data.requestId); // request_id
        smartBuffer.writeUInt32LE(this.data.errorCode); // error_code

        smartBuffer.writeUInt32LE(this.data.entries?.length ?? 0); // stack_size
        for (const entry of this.data.entries ?? []) {
            smartBuffer.writeUInt32LE(entry.lineNumber); // line_number
            // NOTE: this is documented as being function name then file name but it is being returned by the device backwards.
            smartBuffer.writeStringNT(entry.filePath); // file_path
            smartBuffer.writeStringNT(entry.functionName); // function_name
        }

        this.data.packetLength = smartBuffer.writeOffset;
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
