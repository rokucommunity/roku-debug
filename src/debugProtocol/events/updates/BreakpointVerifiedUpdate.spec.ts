import { expect } from 'chai';
import { ErrorCode, UpdateType } from '../../Constants';
import { BreakpointVerifiedUpdate } from './BreakpointVerifiedUpdate';

describe('BreakpointVerifiedUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = BreakpointVerifiedUpdate.fromJson({
            breakpoints: [{
                id: 2
            }, {
                id: 1
            }]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.BreakpointVerified,

            breakpoints: [{
                id: 2
            }, {
                id: 1
            }]
        });

        expect(
            BreakpointVerifiedUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 32, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.BreakpointVerified, // 4 bytes

            //flags: 0 // 4 bytes

            //num_breakpoints // 4 bytes
            breakpoints: [{
                id: 2 // 4 bytes
            }, {
                id: 1 // 4 bytes
            }]
        });
    });
});
