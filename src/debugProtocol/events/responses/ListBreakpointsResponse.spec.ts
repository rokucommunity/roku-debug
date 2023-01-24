import { expect } from 'chai';
import { ListBreakpointsResponse } from './ListBreakpointsResponse';
import { ErrorCode } from '../../Constants';
import { getRandomBuffer } from '../../../testHelpers.spec';

describe('ListBreakpointsResponse', () => {
    it('defaults undefined breakpoint array to empty', () => {
        let response = ListBreakpointsResponse.fromJson({} as any);
        expect(response.data.breakpoints).to.eql([]);
    });

    it('skips ignoreCount for invalid breakpoints', () => {
        const response = ListBreakpointsResponse.fromBuffer(
            ListBreakpointsResponse.fromJson({
                requestId: 2,
                breakpoints: [{
                    id: 12,
                    errorCode: ErrorCode.OK,
                    ignoreCount: 10
                }, {
                    id: 0,
                    errorCode: ErrorCode.OK,
                    ignoreCount: 20
                }]
            }).toBuffer()
        );
        expect(response.data.breakpoints[0].ignoreCount).to.eql(10);
        expect(response.data.breakpoints[1].ignoreCount).to.eql(undefined);

    });

    it('defaults num_breakpoints to 0 if array is missing', () => {
        let response = ListBreakpointsResponse.fromJson({} as any);
        response.data = {} as any;
        response = ListBreakpointsResponse.fromBuffer(
            response.toBuffer()
        );
        expect(response.data.breakpoints).to.eql([]);
    });

    it('serializes and deserializes multiple breakpoints properly', () => {
        let response = ListBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                id: 10,
                ignoreCount: 2
            }, {
                errorCode: ErrorCode.OK,
                id: 20,
                ignoreCount: 3
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                id: 10,
                ignoreCount: 2
            }, {
                errorCode: ErrorCode.OK,
                id: 20,
                ignoreCount: 3
            }]
        });

        response = ListBreakpointsResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 40, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ErrorCode.OK, // 4 bytes
            //num_breakpoints // 4 bytes
            breakpoints: [{
                errorCode: ErrorCode.OK, // 4 bytes
                id: 10, // 4 bytes
                ignoreCount: 2 // 4 bytes
            }, {
                errorCode: ErrorCode.OK, // 4 bytes
                id: 20, // 4 bytes
                ignoreCount: 3 // 4 bytes
            }]
        });
    });

    it('handles empty breakpoints array', () => {
        let response = ListBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: []
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,
            breakpoints: []
        });

        response = ListBreakpointsResponse.fromBuffer(response.toBuffer());

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
        const response = ListBreakpointsResponse.fromBuffer(null);
        //Great, it didn't explode!
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        let response = ListBreakpointsResponse.fromBuffer(
            getRandomBuffer(0)
        );
        expect(response.success).to.be.false;

        response = ListBreakpointsResponse.fromBuffer(
            getRandomBuffer(1)
        );
        expect(response.success).to.be.false;

        response = ListBreakpointsResponse.fromBuffer(
            getRandomBuffer(11)
        );
        expect(response.success).to.be.false;
    });

    it('gracefully handles mismatched breakpoint count', () => {
        let buffer = ListBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                id: 1,
                ignoreCount: 0
            }]
        }).toBuffer();

        //set num_breakpoints to 2 instead of 1
        buffer = Buffer.concat([
            buffer.slice(0, 12),
            Buffer.from([2, 0, 0, 0]),
            buffer.slice(16)
        ]);

        const response = ListBreakpointsResponse.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.breakpoints).to.eql([{
            errorCode: ErrorCode.OK,
            id: 1,
            ignoreCount: 0
        }]);
    });

    it('handles malformed breakpoint data', () => {
        let buffer = ListBreakpointsResponse.fromJson({
            requestId: 3,
            breakpoints: [{
                errorCode: ErrorCode.OK,
                id: 1,
                ignoreCount: 0
            }, {
                errorCode: ErrorCode.OK,
                id: 2,
                ignoreCount: 0
            }]
        }).toBuffer();

        //set num_breakpoints to 2 instead of 1
        buffer = Buffer.concat([
            buffer.slice(0, buffer.length - 3)
        ]);

        const response = ListBreakpointsResponse.fromBuffer(buffer);
        expect(response.success).to.be.false;
        expect(response.data.breakpoints).to.eql([{
            errorCode: ErrorCode.OK,
            id: 1,
            ignoreCount: 0
        }]);
    });
});
