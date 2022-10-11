/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import type { StopReason } from '../../Constants';
import { ERROR_CODES, StopReasonCode } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';

export class ThreadsResponse {
    public static fromJson(data: {
        requestId: number;
        threads: ThreadInfo[];
    }) {
        const response = new ThreadsResponse();
        protocolUtils.loadJson(response, data);
        response.data.threads ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new ThreadsResponse();
        protocolUtils.bufferLoaderHelper(response, buffer, 16, (smartBuffer: SmartBuffer) => {
            protocolUtils.loadCommonResponseFields(response, smartBuffer);

            const threadsCount = smartBuffer.readUInt32LE(); // threads_count

            response.data.threads = [];

            // build the list of threads
            for (let i = 0; i < threadsCount; i++) {
                const thread = {} as ThreadInfo;
                // NOTE: The docs say the flags should be both unit8 AND uint32. In testing it seems like they are sending uint32 but meant to send unit8.
                const flags = smartBuffer.readUInt32LE();
                thread.isPrimary = (flags & ThreadInfoFlags.isPrimary) > 0;

                thread.stopReason = StopReasonCode[smartBuffer.readUInt8()] as StopReason; // stop_reason
                thread.stopReasonDetail = protocolUtils.readStringNT(smartBuffer); // stop_reason_detail
                thread.lineNumber = smartBuffer.readUInt32LE(); // line_number
                thread.functionName = protocolUtils.readStringNT(smartBuffer); // function_name
                thread.filePath = protocolUtils.readStringNT(smartBuffer); // file_path
                thread.codeSnippet = protocolUtils.readStringNT(smartBuffer); // code_snippet

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
            // NOTE: The docs say the flags should be both unit8 AND uint32. In testing it seems like they are sending uint32 but meant to send unit8.
            smartBuffer.writeUInt32LE(flags);

            smartBuffer.writeUInt8(StopReasonCode[thread.stopReason]); // stop_reason
            smartBuffer.writeStringNT(thread.stopReasonDetail); // stop_reason_detail
            smartBuffer.writeUInt32LE(thread.lineNumber); // line_number
            smartBuffer.writeStringNT(thread.functionName); // function_name
            smartBuffer.writeStringNT(thread.filePath); // file_path
            smartBuffer.writeStringNT(thread.codeSnippet); // code_snippet
        }
        protocolUtils.insertCommonResponseFields(this, smartBuffer);
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
        errorCode: ERROR_CODES.OK
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
    /**
     * The code causing the stop or failure.
     */
    codeSnippet: string;
}

enum ThreadInfoFlags {
    isPrimary = 0x01
}
