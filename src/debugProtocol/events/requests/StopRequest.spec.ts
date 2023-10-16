import { expect } from 'chai';
import { Command, StepType } from '../../Constants';
import { StopRequest } from './StopRequest';

describe('StopRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = StopRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Stop
        });

        expect(
            StopRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Stop // 4 bytes
        });
    });
});
