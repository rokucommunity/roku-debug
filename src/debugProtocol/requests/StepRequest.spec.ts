import { expect } from 'chai';
import { COMMANDS, STEP_TYPE } from '../Constants';
import { StepRequest } from './StepRequest';

describe('StepRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = StepRequest.fromJson({
            requestId: 3,
            threadIndex: 2,
            stepType: STEP_TYPE.STEP_TYPE_LINE
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.STEP,

            threadIndex: 2,
            stepType: STEP_TYPE.STEP_TYPE_LINE
        });

        expect(
            StepRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 17, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.STEP, // 4 bytes

            stepType: STEP_TYPE.STEP_TYPE_LINE, // 1 byte
            threadIndex: 2 // 4 bytes
        });
    });
});
