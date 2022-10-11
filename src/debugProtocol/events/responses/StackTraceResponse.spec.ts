import { expect } from 'chai';
import { StackTraceResponse } from './StackTraceResponse';
import { ERROR_CODES } from '../../Constants';
import { getRandomBuffer } from '../zzresponsesOld/responseCreationHelpers.spec';

describe('StackTraceResponse', () => {
    it('serializes and deserializes multiple breakpoints properly', () => {
        let response = StackTraceResponse.fromJson({
            requestId: 3,
            entries: [{
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs'
            }, {
                lineNumber: 1,
                functionName: 'libFunc',
                filePath: 'pkg:/source/lib.brs'
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            entries: [{
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs'
            }, {
                lineNumber: 1,
                functionName: 'libFunc',
                filePath: 'pkg:/source/lib.brs'
            }]
        });

        response = StackTraceResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: undefined, // 0 bytes
            requestId: 3, // 4 bytes,
            errorCode: ERROR_CODES.OK, // 4 bytes
            // num_entries // 4 bytes
            entries: [{
                lineNumber: 2, // 4 bytes
                functionName: 'main', // 5 bytes
                filePath: 'pkg:/source/main.brs' // 21 bytes
            }, {
                lineNumber: 1, // 4 bytes
                functionName: 'libFunc', // 8 bytes
                filePath: 'pkg:/source/lib.brs' // 20 bytes
            }]
        });

        expect(response.readOffset).to.eql(74);
    });

    it('handles empty entries array', () => {
        let response = StackTraceResponse.fromJson({
            requestId: 3,
            entries: []
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            entries: []
        });

        response = StackTraceResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: undefined, // 0 bytes
            requestId: 3, // 4 bytes,
            errorCode: ERROR_CODES.OK, // 4 bytes
            // num_entries // 4 bytes
            entries: []
        });
        expect(response.readOffset).to.eql(12);
    });

    it('handles empty buffer', () => {
        const response = StackTraceResponse.fromBuffer(null);
        //Great, it didn't explode!
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        let response = StackTraceResponse.fromBuffer(
            getRandomBuffer(0)
        );
        expect(response.success).to.be.false;

        response = StackTraceResponse.fromBuffer(
            getRandomBuffer(1)
        );
        expect(response.success).to.be.false;

        response = StackTraceResponse.fromBuffer(
            getRandomBuffer(11)
        );
        expect(response.success).to.be.false;
    });
});
