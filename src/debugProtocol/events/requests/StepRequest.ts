import { SmartBuffer } from 'smart-buffer';
import type { StepType } from '../../Constants';
import { Command, StepTypeCode } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class StepRequest implements ProtocolRequest {

    public static fromJson(data: { requestId: number; threadIndex: number; stepType: StepType }) {
        const request = new StepRequest();
        protocolUtils.loadJson(request, data);
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new StepRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);
            request.data.threadIndex = smartBuffer.readUInt32LE(); // thread_index
            request.data.stepType = StepTypeCode[smartBuffer.readUInt8()] as StepType; // step_type
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt32LE(this.data.threadIndex); //thread_index
        smartBuffer.writeUInt8(StepTypeCode[this.data.stepType]); //step_type

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset: number = undefined;

    public data = {
        threadIndex: undefined as number,
        stepType: undefined as StepType,

        //common props
        command: Command.Step,
        packetLength: undefined as number,
        requestId: undefined as number

    };
}

