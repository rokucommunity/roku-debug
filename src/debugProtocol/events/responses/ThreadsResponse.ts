/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import type { StopReason } from '../../Constants';
import { ErrorCode, StopReasonCode } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';

export class ThreadsResponse {
    public static fromJson(data: {
        requestId: number;
        threads: ThreadInfo[];
    }) {
        const response = new ThreadsResponse();
        protocolUtil.loadJson(response, data);
        response.data.threads ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new ThreadsResponse();
        protocolUtil.bufferLoaderHelper(response, buffer, 16, (smartBuffer: SmartBuffer) => {
            protocolUtil.loadCommonResponseFields(response, smartBuffer);

            const threadsCount = smartBuffer.readUInt32LE(); // threads_count

            response.data.threads = [];

            // build the list of threads
            for (let i = 0; i < threadsCount; i++) {
                const thread = {} as ThreadInfo;
                const flags = smartBuffer.readUInt8();
                thread.isPrimary = (flags & ThreadInfoFlags.isPrimary) > 0;
                thread.stopReason = StopReasonCode[smartBuffer.readUInt32LE()] as StopReason; // stop_reason
                thread.stopReasonDetail = protocolUtil.readStringNT(smartBuffer); // stop_reason_detail
                thread.lineNumber = smartBuffer.readUInt32LE(); // line_number
                thread.functionName = protocolUtil.readStringNT(smartBuffer); // function_name
                thread.filePath = protocolUtil.readStringNT(smartBuffer); // file_path
                thread.codeSnippet = protocolUtil.readStringNT(smartBuffer); // code_snippet

                response.data.threads.push(thread);
            }
        });
        return response;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        smartBuffer.writeUInt32LE(this.data.threads?.length ?? 0); // threads_count
        for (const thread of this.data.threads ?? []) {
            let flags = 0;
            flags |= thread.isPrimary ? 1 : 0;
            smartBuffer.writeUInt8(flags); //flags
            //stop_reason is an 8-bit value (same as the other locations in this protocol); however, it is sent in this response as a 32bit value for historical purposes
            smartBuffer.writeUInt32LE(StopReasonCode[thread.stopReason]); // stop_reason
            smartBuffer.writeStringNT(thread.stopReasonDetail); // stop_reason_detail
            smartBuffer.writeUInt32LE(thread.lineNumber); // line_number
            smartBuffer.writeStringNT(thread.functionName); // function_name
            smartBuffer.writeStringNT(thread.filePath); // file_path
            smartBuffer.writeStringNT(thread.codeSnippet); // code_snippet
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
        threads: undefined as ThreadInfo[],

        // response fields
        packetLength: undefined as number,
        requestId: undefined as number,
        errorCode: ErrorCode.OK
    };
}

export interface ThreadInfo {
    /**
     * Indicates whether this thread likely caused the stop or failure
     */
    isPrimary: boolean;
    /**
     * An enum describing why the thread was stopped.
     */
    stopReason: StopReason;
    /**
     * Provides extra details about the stop (for example, "Divide by Zero", "STOP", "BREAK")
     */
    stopReasonDetail: string;
    /**
     * The 1-based line number where the stop or failure occurred.
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
    /**
     * The code causing the stop or failure.
     */
    codeSnippet: string;
}

enum ThreadInfoFlags {
    isPrimary = 0x01
}
