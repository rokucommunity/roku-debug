import { expect } from 'chai';
import { ListBreakpointsResponse } from './ListBreakpointsResponse';
import { ERROR_CODES } from '../../Constants';
import { getRandomBuffer } from '../zzresponsesOld/responseCreationHelpers.spec';

describe('ListBreakpointsResponse', () => {
    let response: ListBreakpointsResponse;
    beforeEach(() => {
        response = undefined;
    });

    it('serializes and deserializes multiple breakpoints properly', () => {
        let response = ListBreakpointsResponse.fromJson({
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            breakpoints: [{
                errorCode: ERROR_CODES.OK,
                id: 10,
                ignoreCount: 2
            }, {
                errorCode: ERROR_CODES.OK,
                id: 20,
                ignoreCount: 3
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            breakpoints: [{
                errorCode: ERROR_CODES.OK,
                id: 10,
                ignoreCount: 2
            }, {
                errorCode: ERROR_CODES.OK,
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
            errorCode: ERROR_CODES.OK, // 4 bytes
            //num_breakpoints // 4 bytes
            breakpoints: [{
                errorCode: ERROR_CODES.OK, // 4 bytes
                id: 10, // 4 bytes
                ignoreCount: 2 // 4 bytes
            }, {
                errorCode: ERROR_CODES.OK, // 4 bytes
                id: 20, // 4 bytes
                ignoreCount: 3 // 4 bytes
            }]
        });
    });

    it('handles empty breakpoints array', () => {
        let response = ListBreakpointsResponse.fromJson({
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            breakpoints: []
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            breakpoints: []
        });

        response = ListBreakpointsResponse.fromBuffer(response.toBuffer());

        expect(
            response.data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes,
            errorCode: ERROR_CODES.OK, // 4 bytes
            //num_breakpoints // 4 bytes
            breakpoints: []
        });
    });

    it('handles empty buffer', () => {
        response = ListBreakpointsResponse.fromBuffer(null);
        //Great, it didn't explode!
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        response = ListBreakpointsResponse.fromBuffer(
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
            errorCode: ERROR_CODES.OK,
            breakpoints: [{
                errorCode: ERROR_CODES.OK,
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
            errorCode: ERROR_CODES.OK,
            id: 1,
            ignoreCount: 0
        }]);
    });

    it('handles malformed breakpoint data', () => {
        let buffer = ListBreakpointsResponse.fromJson({
            requestId: 3,
            errorCode: ERROR_CODES.OK,
            breakpoints: [{
                errorCode: ERROR_CODES.OK,
                id: 1,
                ignoreCount: 0
            }, {
                errorCode: ERROR_CODES.OK,
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
            errorCode: ERROR_CODES.OK,
            id: 1,
            ignoreCount: 0
        }]);
    });
});
