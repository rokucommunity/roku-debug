import { expect } from 'chai';
import { ErrorCode, StopReasonCode, UpdateType } from '../../Constants';
import { IOPortOpenedUpdate } from './IOPortOpenedUpdate';

describe('IOPortOpenedUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = IOPortOpenedUpdate.fromJson({
            port: 1234
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.IOPortOpened,

            port: 1234
        });

        expect(
            IOPortOpenedUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 20, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.IOPortOpened, // 4 bytes

            port: 1234 // 4 bytes
        });
    });
});
