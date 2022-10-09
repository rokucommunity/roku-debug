import { expect } from 'chai';
import { ERROR_CODES, STOP_REASONS, UPDATE_TYPES } from '../../Constants';
import { AllThreadsStoppedUpdate } from './AllThreadsStoppedUpdate';

describe('AllThreadsStoppedUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = AllThreadsStoppedUpdate.fromJson({
            primaryThreadIndex: 1,
            errorCode: ERROR_CODES.OK,
            stopReason: STOP_REASONS.BREAK,
            stopReasonDetail: 'because'
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ERROR_CODES.OK,
            updateType: UPDATE_TYPES.ALL_THREADS_STOPPED,

            primaryThreadIndex: 1,
            stopReason: STOP_REASONS.BREAK,
            stopReasonDetail: 'because'
        });

        expect(
            AllThreadsStoppedUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 29, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ERROR_CODES.OK, // 4 bytes
            updateType: UPDATE_TYPES.ALL_THREADS_STOPPED, // 4 bytes

            primaryThreadIndex: 1, // 4 bytes
            stopReason: STOP_REASONS.BREAK, // 1 bytes
            stopReasonDetail: 'because' // 8 bytes
        });
    });
});
