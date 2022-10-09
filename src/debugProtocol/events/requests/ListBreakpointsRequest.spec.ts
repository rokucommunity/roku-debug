import { expect } from 'chai';
import { COMMANDS } from '../../Constants';
import { ListBreakpointsRequest } from './ListBreakpointsRequest';

describe('ListBreakpointsRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ListBreakpointsRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.LIST_BREAKPOINTS
        });

        expect(
            ListBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.LIST_BREAKPOINTS // 4 bytes
        });
    });
});
