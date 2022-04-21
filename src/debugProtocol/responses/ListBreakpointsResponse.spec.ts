import { createListBreakpointsResponse, getRandomBuffer } from './responseCreationHelpers.spec';
import { expect } from 'chai';
import { ListBreakpointsResponse } from './ListBreakpointsResponse';
import { ERROR_CODES } from '../Constants';

describe('ListBreakpointsResponse', () => {
    let response: ListBreakpointsResponse;
    beforeEach(() => {
        response = undefined;
    });
    it('handles empty buffer', () => {
        response = new ListBreakpointsResponse(null);
        //Great, it didn't explode!
        expect(response.success).to.be.false;
    });

    it('handles undersized buffers', () => {
        response = new ListBreakpointsResponse(
            getRandomBuffer(0)
        );
        expect(response.success).to.be.false;

        response = new ListBreakpointsResponse(
            getRandomBuffer(1)
        );
        expect(response.success).to.be.false;

        response = new ListBreakpointsResponse(
            getRandomBuffer(11)
        );
        expect(response.success).to.be.false;
    });

    it('gracefully handles mismatched breakpoint count', () => {
        const bp1 = {
            breakpointId: 1,
            errorCode: ERROR_CODES.OK,
            hitCount: 0,
            success: true
        };
        response = new ListBreakpointsResponse(
            createListBreakpointsResponse({
                requestId: 1,
                num_breakpoints: 2,
                breakpoints: [bp1]
            }).toBuffer()
        );
        expect(response.success).to.be.false;
        expect(response.breakpoints).to.eql([bp1]);
    });

    it('handles malformed breakpoint data', () => {
        const bp1 = {
            breakpointId: 1,
            errorCode: ERROR_CODES.OK,
            hitCount: 2,
            success: true
        };
        response = new ListBreakpointsResponse(
            createListBreakpointsResponse({
                requestId: 1,
                num_breakpoints: 2,
                breakpoints: [
                    bp1,
                    {
                        //missing all other bp properties
                        breakpointId: 1
                    }
                ]
            }).toBuffer()
        );
        expect(response.success).to.be.false;
        expect(response.breakpoints).to.eql([bp1]);
    });

    it('handles malformed breakpoint data', () => {
        const bp1 = {
            breakpointId: 0,
            errorCode: ERROR_CODES.OK,
            success: true
        };
        response = new ListBreakpointsResponse(
            createListBreakpointsResponse({
                requestId: 1,
                num_breakpoints: 2,
                breakpoints: [bp1]
            }).toBuffer()
        );
        expect(response.success).to.be.false;
        //hitcount should not be set when bpId is zero
        expect(response.breakpoints[0].hitCount).to.be.undefined;
        //the breakpoint should not be verified if bpId === 0
        expect(response.breakpoints[0].isVerified).to.be.false;
    });

    it('reads breakpoint data properly', () => {
        const bp1 = {
            breakpointId: 1,
            errorCode: ERROR_CODES.OK,
            hitCount: 0,
            success: true
        };
        response = new ListBreakpointsResponse(
            createListBreakpointsResponse({
                requestId: 1,
                breakpoints: [bp1]
            }).toBuffer()
        );
        expect(response.success).to.be.true;
        expect(response.breakpoints).to.eql([bp1]);
        expect(response.breakpoints[0].isVerified).to.be.true;
    });

    it('reads breakpoint data properly', () => {
        const bp1 = {
            breakpointId: 1,
            errorCode: ERROR_CODES.NOT_STOPPED,
            hitCount: 0,
            success: true
        };
        response = new ListBreakpointsResponse(
            createListBreakpointsResponse({
                requestId: 1,
                breakpoints: [bp1]
            }).toBuffer()
        );
        expect(
            response.breakpoints[0].errorText
        ).to.eql(
            ERROR_CODES[ERROR_CODES.NOT_STOPPED]
        );
    });
});
