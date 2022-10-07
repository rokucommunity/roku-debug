import { expect } from 'chai';
import { COMMANDS } from '../Constants';
import { ExitChannelRequest } from './ExitChannelRequest';

describe('ExitChannelRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ExitChannelRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.EXIT_CHANNEL
        });

        expect(
            ExitChannelRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.EXIT_CHANNEL // 4 bytes
        });
    });
});
