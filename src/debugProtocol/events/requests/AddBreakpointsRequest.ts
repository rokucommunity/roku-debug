import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class AddBreakpointsRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        breakpoints: Array<{
            filePath: string;
            lineNumber: number;
            ignoreCount: number;
        }>;
    }) {
        const request = new AddBreakpointsRequest();
        protocolUtils.loadJson(request, data);
        request.data.breakpoints ??= [];
        //default ignoreCount to 0 for consistency purposes
        for (const breakpoint of request.data.breakpoints) {
            breakpoint.ignoreCount ??= 0;
        }
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new AddBreakpointsRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);

            const numBreakpoints = smartBuffer.readUInt32LE(); // num_breakpoints
            request.data.breakpoints = [];
            for (let i = 0; i < numBreakpoints; i++) {
                request.data.breakpoints.push({
                    filePath: protocolUtils.readStringNT(smartBuffer), // file_path
                    lineNumber: smartBuffer.readUInt32LE(), // line_number
                    ignoreCount: smartBuffer.readUInt32LE() // ignore_count
                });
            }
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.breakpoints.length); // num_breakpoints
        for (const breakpoint of this.data.breakpoints) {
            smartBuffer.writeStringNT(breakpoint.filePath); // file_path
            smartBuffer.writeUInt32LE(breakpoint.lineNumber); // line_number
            smartBuffer.writeUInt32LE(breakpoint.ignoreCount); // ignore_count
        }

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        breakpoints: undefined as Array<{
            filePath: string;
            lineNumber: number;
            ignoreCount: number;
        }>,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.AddBreakpoints
    };
}
