import { SmartBuffer } from 'smart-buffer';
import { ErrorCode } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';

export class ListBreakpointsResponse {

    public static fromJson(data: {
        requestId: number;
        breakpoints: BreakpointInfo[];
    }) {
        const response = new ListBreakpointsResponse();
        protocolUtil.loadJson(response, data);
        response.data.breakpoints ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new ListBreakpointsResponse();
        protocolUtil.bufferLoaderHelper(response, buffer, 12, (smartBuffer: SmartBuffer) => {
            protocolUtil.loadCommonResponseFields(response, smartBuffer);
            const numBreakpoints = smartBuffer.readUInt32LE(); // num_breakpoints

            response.data.breakpoints = [];

            // build the list of BreakpointInfo
            for (let i = 0; i < numBreakpoints; i++) {
                const breakpoint = {} as BreakpointInfo;
                // breakpoint_id - The ID assigned to the breakpoint. An ID greater than 0 indicates an active breakpoint. An ID of 0 denotes that the breakpoint has an error.
                breakpoint.id = smartBuffer.readUInt32LE();
                // error_code - Indicates whether the breakpoint was successfully returned.
                breakpoint.errorCode = smartBuffer.readUInt32LE();

                if (breakpoint.id > 0) {
                    // This value is only present if the breakpoint_id is valid.
                    // ignore_count - Current state, decreases as breakpoint is executed.
                    breakpoint.ignoreCount = smartBuffer.readUInt32LE();
                }
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
            smartBuffer.writeUInt32LE(breakpoint.id); // breakpoint_id
            smartBuffer.writeUInt32LE(breakpoint.errorCode); // error_code
            //if this breakpoint has no errors, then write its ignore_count
            if (breakpoint.id > 0) {
                smartBuffer.writeUInt32LE(breakpoint.ignoreCount); // ignore_count
            }
        }
        protocolUtil.insertCommonResponseFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        breakpoints: undefined as BreakpointInfo[],

        // response fields
        packetLength: undefined as number,
        requestId: undefined as number,
        errorCode: ErrorCode.OK
    };
}

export interface BreakpointInfo {
    /**
     * The ID assigned to the breakpoint. An ID greater than 0 indicates an active breakpoint. An ID of 0 denotes that the breakpoint has an error.
     */
    id: number;
    /**
     * Indicates whether the breakpoint was successfully returned. This may be one of the following values:
     * - `0` (`'OK'`) - The breakpoint_id is valid.
     * - `5` (`'INVALID_ARGS'`) - The breakpoint could not be returned.
     */
    errorCode: number;
    /**
     * Current state, decreases as breakpoint is executed. This argument is only present if the breakpoint_id is valid.
     */
    ignoreCount: number;
}
