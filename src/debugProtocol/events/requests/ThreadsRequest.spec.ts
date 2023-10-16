import { expect } from 'chai';
import { Command } from '../../Constants';
import { ThreadsRequest } from './ThreadsRequest';

describe('ThreadsRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ThreadsRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Threads
        });

        expect(
            ThreadsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Threads // 4 bytes
        });
    });
});
