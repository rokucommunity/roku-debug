import { expect } from 'chai';
import { Command } from '../../Constants';
import { RemoveBreakpointsRequest } from './RemoveBreakpointsRequest';

describe('RemoveBreakpointsRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = RemoveBreakpointsRequest.fromJson({
            requestId: 3,
            breakpointIds: [1, 2, 100]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.RemoveBreakpoints,

            breakpointIds: [1, 2, 100],
            numBreakpoints: 3
        });

        expect(
            RemoveBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 28, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.RemoveBreakpoints, // 4 bytes

            breakpointIds: [1, 2, 100], // 12 bytes
            numBreakpoints: 3 // 4 bytes
        });
    });
});
