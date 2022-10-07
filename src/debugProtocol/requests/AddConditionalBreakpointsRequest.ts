import { SmartBuffer } from 'smart-buffer';
import { util } from '../../util';
import { COMMANDS } from '../Constants';
import { protocolUtils } from '../ProtocolUtil';
import type { ProtocolRequest } from './ProtocolRequest';

export class AddConditionalBreakpointsRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        breakpoints: Array<{
            filePath: string;
            lineNumber: number;
            ignoreCount: number;
            conditionalExpression?: string;
        }>;
    }) {
        const request = new AddConditionalBreakpointsRequest();
        protocolUtils.loadJson(request, data);
        request.data.breakpoints ??= [];
        //default ignoreCount to 0 for consistency purposes
        for (const breakpoint of request.data.breakpoints) {
            breakpoint.ignoreCount ??= 0;
            //There's a bug in 3.1 where empty conditional expressions would crash the breakpoints, so just default to `true` which always succeeds
            breakpoint.conditionalExpression = breakpoint.conditionalExpression?.trim() ? breakpoint.conditionalExpression : 'true';
        }
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new AddConditionalBreakpointsRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);

            const numBreakpoints = smartBuffer.readUInt32LE(); // num_breakpoints
            request.data.breakpoints = [];
            for (let i = 0; i < numBreakpoints; i++) {
                request.data.breakpoints.push({
                    filePath: util.readStringNT(smartBuffer), // file_path
                    lineNumber: smartBuffer.readUInt32LE(), // line_number
                    ignoreCount: smartBuffer.readUInt32LE(), // ignore_count
                    conditionalExpression: util.readStringNT(smartBuffer) // cond_expr
                });
            }
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(0); // flags - Should always be passed as 0. Unused, reserved for future use.

        smartBuffer.writeUInt32LE(this.data.breakpoints.length); // num_breakpoints
        for (const breakpoint of this.data.breakpoints) {
            smartBuffer.writeStringNT(breakpoint.filePath); // file_path
            smartBuffer.writeUInt32LE(breakpoint.lineNumber); // line_number
            smartBuffer.writeUInt32LE(breakpoint.ignoreCount); // ignore_count
            smartBuffer.writeStringNT(breakpoint.conditionalExpression); // cond_expr
        }

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        breakpoints: undefined as Array<{
            /**
             * The path of the source file where the conditional breakpoint is to be inserted.
             *
             * "pkg:/" specifies a file in the channel
             *
             * "lib:/<library_name>/" specifies a file in a library.
             */
            filePath: string;
            /**
             * The line number in the channel application code where the breakpoint is to be executed.
             */
            lineNumber: number;
            /**
             * The number of times to ignore the breakpoint condition before executing the breakpoint. This number is decremented each time the channel application reaches the breakpoint. If cond_expr is specified, the ignore_count is only updated if it evaluates to true.
             */
            ignoreCount: number;
            /**
             * BrightScript code that evaluates to a boolean value. The cond_expr is compiled and executed in the context where the breakpoint is located. If cond_expr is specified, the ignore_count is only be updated if this evaluates to true.
             */
            conditionalExpression?: string;
        }>,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        commandCode: COMMANDS.ADD_CONDITIONAL_BREAKPOINTS
    };
}
