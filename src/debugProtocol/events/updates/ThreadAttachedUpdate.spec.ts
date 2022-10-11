import { expect } from 'chai';
import { ERROR_CODES, STOP_REASONS, UPDATE_TYPES } from '../../Constants';
import { ThreadAttachedUpdate } from './ThreadAttachedUpdate';

describe('AllThreadsStoppedUpdate', () => {
    it('serializes and deserializes properly', () => {
        const update = ThreadAttachedUpdate.fromJson({
            threadIndex: 1,
            errorCode: ERROR_CODES.OK,
            stopReason: STOP_REASONS.BREAK,
            stopReasonDetail: 'because'
        });

        expect(update.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ERROR_CODES.OK,
            updateType: UPDATE_TYPES.THREAD_ATTACHED,

            threadIndex: 1,
            stopReason: STOP_REASONS.BREAK,
            stopReasonDetail: 'because'
        });

        expect(
            ThreadAttachedUpdate.fromBuffer(update.toBuffer()).data
        ).to.eql({
            packetLength: 29, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ERROR_CODES.OK, // 4 bytes
            updateType: UPDATE_TYPES.THREAD_ATTACHED, // 4 bytes

            threadIndex: 1, // 4 bytes
            stopReason: STOP_REASONS.BREAK, // 1 bytes
            stopReasonDetail: 'because' // 8 bytes
        });
    });
});
