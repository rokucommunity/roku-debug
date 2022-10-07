import { expect } from 'chai';
import { COMMANDS, STEP_TYPE } from '../Constants';
import { StopRequest } from './StopRequest';

describe('StopRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = StopRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.STOP
        });

        expect(
            StopRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.STOP // 4 bytes
        });
    });
});
