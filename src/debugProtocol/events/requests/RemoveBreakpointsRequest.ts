import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class RemoveBreakpointsRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number; breakpointIds: number[] }) {
        const request = new RemoveBreakpointsRequest();
        protocolUtils.loadJson(request, data);
        request.data.numBreakpoints = request.data.breakpointIds.length;
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const command = new RemoveBreakpointsRequest();
        protocolUtils.bufferLoaderHelper(command, buffer, 16, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(command, smartBuffer);
            command.data.numBreakpoints = smartBuffer.readUInt32LE();
            command.data.breakpointIds = [];
            for (let i = 0; i < command.data.numBreakpoints; i++) {
                command.data.breakpointIds.push(
                    smartBuffer.readUInt32LE()
                );
            }
        });
        return command;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        smartBuffer.writeUInt32LE(this.data.breakpointIds?.length ?? 0); // num_breakpoints
        for (const breakpointId of this.data.breakpointIds ?? []) {
            smartBuffer.writeUInt32LE(breakpointId as number); // breakpoint_ids
        }
        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset: number = undefined;

    public data = {
        /**
         * The number of breakpoints in the breakpoints array.
         */
        numBreakpoints: undefined as number,
        /**
         * An array of breakpoint IDs representing the breakpoints to be removed.
         */
        breakpointIds: [],


        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.RemoveBreakpoints
    };
}
