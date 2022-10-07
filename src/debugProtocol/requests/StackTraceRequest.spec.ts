import { expect } from 'chai';
import { COMMANDS, STEP_TYPE } from '../Constants';
import { StackTraceRequest } from './StackTraceRequest';

describe('StackTraceRequest', () => {
    it('serializes and deserializes properly', () => {
        const command = StackTraceRequest.fromJson({
            requestId: 3,
            threadIndex: 2
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.STACKTRACE,

            threadIndex: 2
        });

        expect(
            StackTraceRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.STACKTRACE, // 4 bytes

            threadIndex: 2 //4 bytes
        });
    });
});
