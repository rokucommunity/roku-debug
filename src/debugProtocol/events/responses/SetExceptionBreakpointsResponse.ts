import { SmartBuffer } from 'smart-buffer';
import { ErrorCode } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolResponse } from '../ProtocolEvent';

export class SetExceptionBreakpointsResponse implements ProtocolResponse {

    public static fromJson(data: {
        requestId: number;
        breakpoints: BreakpointInfo[];
    }) {
        const response = new SetExceptionBreakpointsResponse();
        protocolUtil.loadJson(response, data);
        response.data.breakpoints ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new SetExceptionBreakpointsResponse();
        protocolUtil.bufferLoaderHelper(response, buffer, 12, (smartBuffer: SmartBuffer) => {
            protocolUtil.loadCommonResponseFields(response, smartBuffer);
            const numBreakpoints = smartBuffer.readUInt32LE(); // num_breakpoints

            response.data.breakpoints = [];

            // build the list of BreakpointInfo
            for (let i = 0; i < numBreakpoints; i++) {
                const breakpoint = {} as BreakpointInfo;
                // filter
                breakpoint.filter = smartBuffer.readUInt32LE();
                // error_code - Indicates whether the breakpoint was successfully returned.
                breakpoint.errorCode = smartBuffer.readUInt32LE();

                response.data.breakpoints.push(breakpoint);
            }
            return response.data.breakpoints.length === numBreakpoints;
        });
        return response;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        smartBuffer.writeUInt32LE(this.data.breakpoints?.length ?? 0); // num_breakpoints
        for (const breakpoint of this.data.breakpoints ?? []) {
            smartBuffer.writeUInt32LE(breakpoint.filter); // breakpoint_id
            smartBuffer.writeUInt32LE(breakpoint.errorCode); // error_code
        }
        protocolUtil.insertCommonResponseFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        breakpoints: [] as BreakpointInfo[],

        // response fields
        packetLength: undefined as number,
        requestId: undefined as number,
        errorCode: ErrorCode.OK
    };
}

export interface BreakpointInfo {
    /**
     * The filter for the breakpoint
     */
    filter: number;
    /**
     * Indicates whether the breakpoint was successfully returned. This may be one of the following values:
     * - `0` (`'OK'`) - The breakpoint_id is valid.
     * - `5` (`'INVALID_ARGS'`) - The breakpoint could not be returned.
     */
    errorCode: number;
}
