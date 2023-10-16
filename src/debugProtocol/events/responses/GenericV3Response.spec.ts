import { GenericV3Response } from './GenericV3Response';
import { expect } from 'chai';
import { ErrorCode } from '../../Constants';
import { SmartBuffer } from 'smart-buffer';

describe('GenericV3Response', () => {
    it('serializes and deserializes properly', () => {
        const response = GenericV3Response.fromJson({
            errorCode: ErrorCode.OK,
            requestId: 3
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: 3
        });

        expect(
            GenericV3Response.fromBuffer(response.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            requestId: 3 // 4 bytes
        });
    });

    it('consumes excess buffer data', () => {
        const response = GenericV3Response.fromJson({
            errorCode: ErrorCode.OK,
            requestId: 3
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
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

        const newResponse = GenericV3Response.fromBuffer(buffer.toBuffer());
        expect(newResponse.readOffset).to.eql(32);

        expect(
            newResponse.data
        ).to.eql({
            packetLength: 32, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            requestId: 3 // 4 bytes
        });
    });

    it('includes error data', () => {
        const response = GenericV3Response.fromJson({
            requestId: 3,
            errorCode: ErrorCode.INVALID_ARGS,
            errorData: {
                invalidPathIndex: 1,
                missingKeyIndex: 2
            }
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.INVALID_ARGS,
            requestId: 3,
            errorData: {
                invalidPathIndex: 1,
                missingKeyIndex: 2
            }
        });

        expect(
            GenericV3Response.fromBuffer(response.toBuffer()).data
        ).to.eql({
            packetLength: 24, // 4 bytes
            errorCode: ErrorCode.INVALID_ARGS, // 4 bytes
            requestId: 3, // 4 bytes
            //error_flags // 4 bytes
            errorData: {
                invalidPathIndex: 1, // 4 bytes
                missingKeyIndex: 2 // 4 bytes
            }
        });
    });
});
