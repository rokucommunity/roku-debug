import { expect } from 'chai';
import { Command } from '../../Constants';
import { ExitChannelRequest } from './ExitChannelRequest';

describe('ExitChannelRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ExitChannelRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.ExitChannel
        });

        expect(
            ExitChannelRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.ExitChannel // 4 bytes
        });
    });
});
