import { expect } from 'chai';
import { ThreadsResponse } from './ThreadsResponse';
import { ErrorCode } from '../../Constants';
import { getRandomBuffer } from '../../../testHelpers.spec';

describe('ThreadsResponse', () => {
    it('serializes and deserializes multiple breakpoints properly', () => {
        let response = ThreadsResponse.fromJson({
            requestId: 3,
            threads: [{
                isPrimary: true,
                stopReason: 'Break',
                stopReasonDetail: 'because',
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs',
                codeSnippet: 'sub main()'
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,
            threads: [{
                isPrimary: true,
                stopReason: 'Break',
                stopReasonDetail: 'because',
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs',
                codeSnippet: 'sub main()'
            }]
        });

        response = ThreadsResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 70, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ErrorCode.OK, // 4 bytes
            // threads_count // 4 bytes
            threads: [{
                // flags // 4 bytes
                isPrimary: true, // 0 bytes - part of flags
                stopReason: 'Break', // 1 byte
                stopReasonDetail: 'because', // 8 bytes
                lineNumber: 2, // 4 bytes
                functionName: 'main', // 5 bytes
                filePath: 'pkg:/source/main.brs', // 21 bytes
                codeSnippet: 'sub main()' // 11 bytes
            }]
        });
    });

    it('handles empty entries array', () => {
        let response = ThreadsResponse.fromJson({
            requestId: 3,
            threads: []
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,
            threads: []
        });

        response = ThreadsResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ErrorCode.OK, // 4 bytes
            // threads_count // 4 bytes
            threads: []
        });
    });

    it('handles empty buffer', () => {
        const response = ThreadsResponse.fromBuffer(null);
        //Great, it didn't explode!
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        let response = ThreadsResponse.fromBuffer(
            getRandomBuffer(0)
        );
        expect(response.success).to.be.false;

        response = ThreadsResponse.fromBuffer(
            getRandomBuffer(1)
        );
        expect(response.success).to.be.false;

        response = ThreadsResponse.fromBuffer(
            getRandomBuffer(11)
        );
        expect(response.success).to.be.false;
    });

    it('gracefully handles mismatched breakpoint count', () => {
        let buffer = ThreadsResponse.fromJson({
            requestId: 3,
            threads: [{
                isPrimary: true,
                stopReason: 'Break',
                stopReasonDetail: 'because',
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs',
                codeSnippet: 'sub main()'
            }]
        }).toBuffer();

        //set num_breakpoints to 2 instead of 1
        buffer = Buffer.concat([
            buffer.slice(0, 12),
            Buffer.from([2, 0, 0, 0]),
            buffer.slice(16)
        ]);

        const response = ThreadsResponse.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.threads).to.eql([{
            isPrimary: true,
            stopReason: 'Break',
            stopReasonDetail: 'because',
            lineNumber: 2,
            functionName: 'main',
            filePath: 'pkg:/source/main.brs',
            codeSnippet: 'sub main()'
        }]);
    });

    it('handles malformed breakpoint data', () => {
        let buffer = ThreadsResponse.fromJson({
            requestId: 3,
            threads: [{
                isPrimary: true,
                stopReason: 'Break',
                stopReasonDetail: 'because',
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs',
                codeSnippet: 'sub main()'
            }, {
                isPrimary: true,
                stopReason: 'Break',
                stopReasonDetail: 'because',
                lineNumber: 3,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs',
                codeSnippet: 'sub main()'
            }]
        }).toBuffer();

        // remove some trailing data
        buffer = Buffer.concat([
            buffer.slice(0, buffer.length - 3)
        ]);

        const response = ThreadsResponse.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.threads).to.eql([{
            isPrimary: true,
            stopReason: 'Break',
            stopReasonDetail: 'because',
            lineNumber: 2,
            functionName: 'main',
            filePath: 'pkg:/source/main.brs',
            codeSnippet: 'sub main()'
        }]);
    });
});
