import { SmartBuffer } from 'smart-buffer';
import type { StopReason } from '../../Constants';
import { ErrorCode, StopReasonCode, UpdateType } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolUpdate } from '../ProtocolEvent';

/**
```
// Data sent as the data segment of message type: BREAKPOINT_VERIFIED
struct BreakpointVerifiedUpdateData {
    uint32 flags             // Always 0, reserved for future use
    uint32 num_breakpoints
    BreakpointVerifiedInfo[num_breakpoints] breakpoint_verified_info
}

struct BreakpointVerifiedInfo {
    uint32 breakpoint_id
}
```
*/
export class BreakpointVerifiedUpdate {

    public static fromJson(data: {
        breakpoints: VerifiedBreakpoint[];
    }) {
        const update = new BreakpointVerifiedUpdate();
        protocolUtil.loadJson(update, data);
        return update;
    }

    public static fromBuffer(buffer: Buffer) {
        const update = new BreakpointVerifiedUpdate();
        protocolUtil.bufferLoaderHelper(update, buffer, 16, (smartBuffer) => {
            protocolUtil.loadCommonUpdateFields(update, smartBuffer, update.data.updateType);

            const flags = smartBuffer.readUInt32LE(); // Always 0, reserved for future use
            const breakpointCount = smartBuffer.readUInt32LE(); // num_breakpoints
            update.data.breakpoints = [];
            for (let i = 0; i < breakpointCount; i++) {
                update.data.breakpoints.push({
                    id: smartBuffer.readUInt32LE() // uint32 breakpoint_id
                });
            }
        });
        return update;
    }

    public toBuffer() {
        let smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(0); // flags (Always 0, reserved for future use)
        const breakpoints = this.data?.breakpoints ?? [];
        smartBuffer.writeUInt32LE(breakpoints.length); // num_breakpoints
        for (const breakpoint of breakpoints) {
            smartBuffer.writeUInt32LE(breakpoint.id ?? 0); //breakpoint_id
        }

        protocolUtil.insertCommonUpdateFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;
    /**
     * How many bytes were read by the `fromBuffer` method. Only populated when constructed by `fromBuffer`
     */
    public readOffset: number = undefined;

    public data = {
        /**
         * The index of the primary thread that triggered the stop
         */
        breakpoints: undefined as VerifiedBreakpoint[],

        //common props
        packetLength: undefined as number,
        requestId: 0, //all updates have requestId === 0
        errorCode: ErrorCode.OK,
        updateType: UpdateType.BreakpointVerified
    };
}

export interface VerifiedBreakpoint {
    id: number;
}
