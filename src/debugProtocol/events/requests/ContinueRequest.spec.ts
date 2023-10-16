import { expect } from 'chai';
import { Command } from '../../Constants';
import { ContinueRequest } from './ContinueRequest';

describe('ContinueRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ContinueRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Continue
        });

        expect(
            ContinueRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Continue // 4 bytes
        });
    });
});
