import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

const ExceptionBreakpointFilterType = {
    '1': 'caught',
    '2': 'uncaught',
    caught: 1,
    uncaught: 2
};

export class SetExceptionBreakpointsRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        breakpoints: Array<ExceptionBreakpointFilter>;
    }) {
        const request = new SetExceptionBreakpointsRequest();
        protocolUtil.loadJson(request, data);
        request.data.breakpoints ??= [];
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new SetExceptionBreakpointsRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);

            const numBreakpoints = smartBuffer.readUInt32LE(); // num_breakpoints
            request.data.breakpoints = [];
            for (let i = 0; i < numBreakpoints; i++) {
                const filterTypeId = smartBuffer.readUInt32LE();
                request.data.breakpoints.push({
                    filter: ExceptionBreakpointFilterType[filterTypeId], // filter
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
            const filterTypeId = ExceptionBreakpointFilterType[breakpoint.filter] as number;
            smartBuffer.writeUInt32LE(filterTypeId); // filter
            smartBuffer.writeStringNT(breakpoint.conditionExpression ?? ''); // cond_expr
        }

        protocolUtil.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    private filterToNumber(filter: string): number {
        switch (filter) {
            case 'caught': return 1;
            case 'uncaught': return 2;
            default: throw new Error(`Unknown filter: ${filter}`);
        }
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        breakpoints: undefined as Array<{
            filter: string;
            conditionExpression: string;
        }>,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.SetExceptionBreakpoints
    };
}


export interface ExceptionBreakpointFilter {
    /**
     * Possible values: 'caught', 'uncaught'
     */
    filter: 'caught' | 'uncaught';
    conditionExpression?: string;
}
