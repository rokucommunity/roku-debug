import { createBreakpointErrorUpdateResponse } from './responseCreationHelpers.spec';
import { expect } from 'chai';
import { BreakpointErrorUpdateResponse } from '../updates/BreakpointErrorUpdate';
import { ERROR_CODES, UPDATE_TYPES } from '../../Constants';

describe('BreakpointErrorUpdateResponse', () => {
    it('Handles zero errors', () => {
        const smartBuffer = createBreakpointErrorUpdateResponse({
            flags: 0,
            breakpoint_id: 23,
            errorCode: ERROR_CODES.OK,
            compile_errors: [],
            runtime_errors: [],
            other_errors: [],
            includePacketLength: false
        });
        const rawBuffer = smartBuffer.toBuffer();
        let update = new BreakpointErrorUpdateResponse(
            rawBuffer
        );
        expect(update.requestId).to.eql(0);
        expect(update.errorCode).to.eql(0);
        expect(update.updateType).to.eql(UPDATE_TYPES.BREAKPOINT_ERROR);
        expect(update.breakpointId).to.eql(23);
        expect(update.flags).to.eql(0);
        expect(update.success).to.eql(true);

        expect(update.compileErrorCount).to.eql(0);
        expect(update.compileErrors).to.eql([]);

        expect(update.runtimeErrorCount).to.eql(0);
        expect(update.runtimeErrors).to.eql([]);

        expect(update.otherErrorCount).to.eql(0);
        expect(update.otherErrors).to.eql([]);
    });

    it('Handles many errors', () => {
        const smartBuffer = createBreakpointErrorUpdateResponse({
            flags: 0,
            breakpoint_id: 23,
            errorCode: ERROR_CODES.OK,
            compile_errors: ['compile error 1'],
            runtime_errors: ['runtime error 1', 'runtime error 2'],
            other_errors: ['other error 1', 'other error 2', 'other error 3'],
            includePacketLength: false
        });
        const rawBuffer = smartBuffer.toBuffer();
        let update = new BreakpointErrorUpdateResponse(
            rawBuffer
        );
        expect(update.compileErrorCount).to.eql(1);
        expect(update.compileErrors).to.eql(['compile error 1']);

        expect(update.runtimeErrorCount).to.eql(2);
        expect(update.runtimeErrors).to.eql(['runtime error 1', 'runtime error 2']);

        expect(update.otherErrorCount).to.eql(3);
        expect(update.otherErrors).to.eql(['other error 1', 'other error 2', 'other error 3']);
    });
});
