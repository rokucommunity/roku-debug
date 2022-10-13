import { expect } from 'chai';
import { Command, StepType } from '../../Constants';
import { StepRequest } from './StepRequest';

describe('StepRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = StepRequest.fromJson({
            requestId: 3,
            threadIndex: 2,
            stepType: StepType.Line
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Step,

            threadIndex: 2,
            stepType: StepType.Line
        });

        expect(
            StepRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 17, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Step, // 4 bytes

            stepType: StepType.Line, // 1 byte
            threadIndex: 2 // 4 bytes
        });
    });
});
