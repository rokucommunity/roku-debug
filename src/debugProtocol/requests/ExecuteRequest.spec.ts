import { expect } from 'chai';
import { COMMANDS } from '../Constants';
import { ExecuteRequest } from './ExecuteRequest';

describe('ExecuteRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = ExecuteRequest.fromJson({
            requestId: 3,
            sourceCode: 'print "text"',
            stackFrameIndex: 2,
            threadIndex: 1
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.EXECUTE,

            sourceCode: 'print "text"',
            stackFrameIndex: 2,
            threadIndex: 1
        });

        expect(
            ExecuteRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 33, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.EXECUTE, // 4 bytes

            sourceCode: 'print "text"', // 13 bytes
            stackFrameIndex: 2, // 4 bytes
            threadIndex: 1 // 4 bytes
        });
    });
});
