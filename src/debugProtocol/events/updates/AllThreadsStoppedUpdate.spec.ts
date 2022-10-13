import { expect } from 'chai';
import { ErrorCode, StopReasonCode, UpdateType } from '../../Constants';
import { AllThreadsStoppedUpdate } from './AllThreadsStoppedUpdate';

describe('AllThreadsStoppedUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = AllThreadsStoppedUpdate.fromJson({
            threadIndex: 1,
            stopReason: StopReasonCode.Break,
            stopReasonDetail: 'because'
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.AllThreadsStopped,

            primaryThreadIndex: 1,
            stopReason: StopReasonCode.Break,
            stopReasonDetail: 'because'
        });

        expect(
            AllThreadsStoppedUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 29, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.AllThreadsStopped, // 4 bytes

            primaryThreadIndex: 1, // 4 bytes
            stopReason: StopReasonCode.Break, // 1 bytes
            stopReasonDetail: 'because' // 8 bytes
        });
    });
});
