import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class SetExceptionsBreakpointsRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        breakpoints: Array<{
            filter: number;
            conditionExpression: string;
        }>;
    }) {
        const request = new SetExceptionsBreakpointsRequest();
        protocolUtil.loadJson(request, data);
        request.data.breakpoints ??= [];
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new SetExceptionsBreakpointsRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);

            const numBreakpoints = smartBuffer.readUInt32LE(); // num_breakpoints
            request.data.breakpoints = [];
            for (let i = 0; i < numBreakpoints; i++) {
                request.data.breakpoints.push({
                    filter: smartBuffer.readUInt32LE(), // filter
                    conditionExpression: protocolUtil.readStringNT(smartBuffer) // cond_expr
                });
            }
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.breakpoints.length); // num_breakpoints
        for (const breakpoint of this.data.breakpoints) {
            smartBuffer.writeUInt32LE(breakpoint.filter); // filter
            smartBuffer.writeStringNT(breakpoint.conditionExpression); // cond_expr
        }

        protocolUtil.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        breakpoints: undefined as Array<{
            filter: number;
            conditionExpression: string;
        }>,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.SetExceptionsBreakpoints
    };
}