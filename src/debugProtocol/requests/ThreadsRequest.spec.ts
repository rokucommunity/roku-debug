import { expect } from 'chai';
import { COMMANDS } from '../Constants';
import { ThreadsRequest } from './ThreadsRequest';

describe('ThreadsRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ThreadsRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.THREADS
        });

        expect(
            ThreadsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.THREADS // 4 bytes
        });
    });
});
