import { expect } from 'chai';
import { SetExceptionBreakpointsResponse } from './SetExceptionBreakpointsResponse';
import { ErrorCode } from '../../Constants';
import { getRandomBuffer } from '../../../testHelpers.spec';

describe('ListBreakpointsResponse', () => {
    it('defaults undefined breakpoint array to empty', () => {
        let response = SetExceptionBreakpointsResponse.fromJson({} as any);
        expect(response.data.breakpoints).to.eql([]);
    });

    it('defaults num_breakpoints to 0 if array is missing', () => {
        let response = SetExceptionBreakpointsResponse.fromJson({} as any);
        response.data = {} as any;
        response = SetExceptionBreakpointsResponse.fromBuffer(
            response.toBuffer()
        );
        expect(response.data.breakpoints).to.eql([]);
    });

    it('serializes and deserializes multiple breakpoints properly', () => {
        let response = SetExceptionBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                filter: 10
            }, {
                errorCode: ErrorCode.OK,
                filter: 20
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                filter: 10
            }, {
                errorCode: ErrorCode.OK,
                filter: 20
            }]
        });

        response = SetExceptionBreakpointsResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 32, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ErrorCode.OK, // 4 bytes
            //num_breakpoints // 4 bytes
            breakpoints: [{
                errorCode: ErrorCode.OK, // 4 bytes
                filter: 10 // 4 bytes
            }, {
                errorCode: ErrorCode.OK, // 4 bytes
                filter: 20 // 4 bytes
            }]
        });
    });

    it('handles empty breakpoints array', () => {
        let response = SetExceptionBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: []
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,
            breakpoints: []
        });

        response = SetExceptionBreakpointsResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ErrorCode.OK, // 4 bytes
            //num_breakpoints // 4 bytes
            breakpoints: []
        });
    });

    it('handles empty buffer', () => {
        const response = SetExceptionBreakpointsResponse.fromBuffer(null);
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        let response = SetExceptionBreakpointsResponse.fromBuffer(
            getRandomBuffer(0)
        );
        expect(response.success).to.be.false;

        response = SetExceptionBreakpointsResponse.fromBuffer(
            getRandomBuffer(1)
        );
        expect(response.success).to.be.false;

        response = SetExceptionBreakpointsResponse.fromBuffer(
            getRandomBuffer(11)
        );
        expect(response.success).to.be.false;
    });

    it('gracefully handles mismatched breakpoint count', () => {
        let buffer = SetExceptionBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                filter: 1
            }]
        }).toBuffer();

        //set num_breakpoints to 2 instead of 1
        buffer = Buffer.concat([
            buffer.slice(0, 12),
            Buffer.from([2, 0, 0, 0]),
            buffer.slice(16)
        ]);

        const response = SetExceptionBreakpointsResponse.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.breakpoints).to.eql([{
            errorCode: ErrorCode.OK,
            filter: 1
        }]);
    });

    it('handles malformed breakpoint data', () => {
        let buffer = SetExceptionBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                filter: 1
            }, {
                errorCode: ErrorCode.OK,
                filter: 2
            }]
        }).toBuffer();

        //set num_breakpoints to 2 instead of 1
        buffer = Buffer.concat([
            buffer.slice(0, buffer.length - 3)
        ]);

        const response = SetExceptionBreakpointsResponse.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.breakpoints).to.eql([{
            errorCode: ErrorCode.OK,
            filter: 1
        }]);
    });
});
