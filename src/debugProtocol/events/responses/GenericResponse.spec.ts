import { GenericResponse } from './GenericResponse';
import { expect } from 'chai';
import { ERROR_CODES } from '../../Constants';

describe('GenericResponse', () => {
    it('Handles a Protocol update events', () => {
        let response = GenericResponse.fromJson({
            requestId: 3,
            errorCode: ERROR_CODES.CANT_CONTINUE
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ERROR_CODES.CANT_CONTINUE,
            requestId: 3
        });

        response = GenericResponse.fromBuffer(response.toBuffer());
        expect(
            response.data
        ).to.eql({
            packetLength: 8, // 0 bytes -- this version of the response doesn't have a packet length
            errorCode: ERROR_CODES.CANT_CONTINUE, // 4 bytes
            requestId: 3 // 4 bytes
        });

        expect(response.readOffset).to.be.equal(8);
        expect(response.success).to.be.equal(true);
    });

    it('Fails when buffer is incomplete', () => {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32LE(10);
        const response = GenericResponse.fromBuffer(buffer);
        expect(response.success).to.equal(false);
    });
});
