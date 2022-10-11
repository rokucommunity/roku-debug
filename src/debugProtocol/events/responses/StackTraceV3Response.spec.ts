import { expect } from 'chai';
import { StackTraceV3Response } from './StackTraceV3Response';
import { ERROR_CODES } from '../../Constants';
import { getRandomBuffer } from '../zzresponsesOld/responseCreationHelpers.spec';

describe('StackTraceV3Response', () => {
    it('serializes and deserializes multiple breakpoints properly', () => {
        let response = StackTraceV3Response.fromJson({
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

        response = StackTraceV3Response.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 78, // 4 bytes
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
    });

    it('handles empty entries array', () => {
        let response = StackTraceV3Response.fromJson({
            requestId: 3,
            entries: []
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            entries: []
        });

        response = StackTraceV3Response.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ERROR_CODES.OK, // 4 bytes
            // num_entries // 4 bytes
            entries: []
        });
    });

    it('handles empty buffer', () => {
        const response = StackTraceV3Response.fromBuffer(null);
        //Great, it didn't explode!
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        let response = StackTraceV3Response.fromBuffer(
            getRandomBuffer(0)
        );
        expect(response.success).to.be.false;

        response = StackTraceV3Response.fromBuffer(
            getRandomBuffer(1)
        );
        expect(response.success).to.be.false;

        response = StackTraceV3Response.fromBuffer(
            getRandomBuffer(11)
        );
        expect(response.success).to.be.false;
    });

    it('gracefully handles mismatched breakpoint count', () => {
        let buffer = StackTraceV3Response.fromJson({
            requestId: 3,
            entries: [{
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs'
            }]
        }).toBuffer();

        //set num_breakpoints to 2 instead of 1
        buffer = Buffer.concat([
            buffer.slice(0, 12),
            Buffer.from([2, 0, 0, 0]),
            buffer.slice(16)
        ]);

        const response = StackTraceV3Response.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.entries).to.eql([{
            lineNumber: 2,
            functionName: 'main',
            filePath: 'pkg:/source/main.brs'
        }]);
    });

    it('handles malformed breakpoint data', () => {
        let buffer = StackTraceV3Response.fromJson({
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
        }).toBuffer();

        // remove some trailing data
        buffer = Buffer.concat([
            buffer.slice(0, buffer.length - 3)
        ]);

        const response = StackTraceV3Response.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.entries).to.eql([{
            lineNumber: 2,
            functionName: 'main',
            filePath: 'pkg:/source/main.brs'
        }]);
    });
});
