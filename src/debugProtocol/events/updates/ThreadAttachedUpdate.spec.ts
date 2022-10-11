import { expect } from 'chai';
import { ErrorCode, StopReasonCode, UPDATE_TYPES } from '../../Constants';
import { ThreadAttachedUpdate } from './ThreadAttachedUpdate';

describe('AllThreadsStoppedUpdate', () => {
    it('serializes and deserializes properly', () => {
        const update = ThreadAttachedUpdate.fromJson({
            threadIndex: 1,
            stopReason: StopReasonCode.Break,
            stopReasonDetail: 'because'
        });

        expect(update.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UPDATE_TYPES.THREAD_ATTACHED,

            threadIndex: 1,
            stopReason: StopReasonCode.Break,
            stopReasonDetail: 'because'
        });

        expect(
            ThreadAttachedUpdate.fromBuffer(update.toBuffer()).data
        ).to.eql({
            packetLength: 29, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UPDATE_TYPES.THREAD_ATTACHED, // 4 bytes

            threadIndex: 1, // 4 bytes
            stopReason: StopReasonCode.Break, // 1 bytes
            stopReasonDetail: 'because' // 8 bytes
        });
    });
});
