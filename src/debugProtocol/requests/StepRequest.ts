import { SmartBuffer } from 'smart-buffer';
import type { CommandData, STEP_TYPE } from '../Constants';
import { COMMANDS } from '../Constants';
import { protocolUtils } from '../ProtocolUtil';
import type { ProtocolRequest } from './ProtocolRequest';

export class StepRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number; threadIndex: number; stepType: STEP_TYPE }) {
        const request = new StepRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new StepRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);
            request.data.threadIndex = smartBuffer.readUInt32LE(); // thread_index
            request.data.stepType = smartBuffer.readUInt8(); // step_type
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.threadIndex); //thread_index
        smartBuffer.writeUInt8(this.data.stepType); //step_type

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        threadIndex: undefined as number,
        stepType: undefined as STEP_TYPE,

        //common props
        commandCode: COMMANDS.STEP,
        packetLength: undefined as number,
        requestId: undefined as number

    };
}

