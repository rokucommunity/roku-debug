import { GenericResponseV3 } from './GenericResponseV3';
import { expect } from 'chai';
import { ERROR_CODES } from '../../Constants';
import { SmartBuffer } from 'smart-buffer';

describe('GenericResponseV3', () => {
    it('serializes and deserializes properly', () => {
        const response = GenericResponseV3.fromJson({
            errorCode: ERROR_CODES.OK,
            requestId: 3
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ERROR_CODES.OK,
            requestId: 3
        });

        expect(
            GenericResponseV3.fromBuffer(response.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            errorCode: ERROR_CODES.OK, // 4 bytes
            requestId: 3 // 4 bytes
        });
    });

    it('consumes excess buffer data', () => {
        const response = GenericResponseV3.fromJson({
            errorCode: ERROR_CODES.OK,
            requestId: 3
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ERROR_CODES.OK,
            requestId: 3
        });

        const buffer = SmartBuffer.fromBuffer(
            //get a buffer without the packetLength
            response.toBuffer().slice(4)
        );
        while (buffer.writeOffset < 28) {
            buffer.writeUInt32LE(1, buffer.length);
        }
        buffer.insertUInt32LE(buffer.length + 4, 0); //packet_length

        const newResponse = GenericResponseV3.fromBuffer(buffer.toBuffer());
        expect(newResponse.readOffset).to.eql(32);

        expect(
            newResponse.data
        ).to.eql({
            packetLength: 32, // 4 bytes
            errorCode: ERROR_CODES.OK, // 4 bytes
            requestId: 3 // 4 bytes
        });
    });
});
