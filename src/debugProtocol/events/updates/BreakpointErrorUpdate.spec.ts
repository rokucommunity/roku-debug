import { expect } from 'chai';
import { ErrorCode, UpdateType } from '../../Constants';
import { BreakpointErrorUpdate } from './BreakpointErrorUpdate';

describe('BreakpointErrorUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = BreakpointErrorUpdate.fromJson({
            breakpointId: 3,
            compileErrors: [
                'compile 1'
            ],
            runtimeErrors: [
                'runtime 1'
            ],
            otherErrors: [
                'other 1'
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.BreakpointError,

            breakpointId: 3,
            compileErrors: [
                'compile 1'
            ],
            runtimeErrors: [
                'runtime 1'
            ],
            otherErrors: [
                'other 1'
            ]
        });

        expect(
            BreakpointErrorUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 64, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.BreakpointError, // 4 bytes

            //flags // 4 bytes

            breakpointId: 3, // 4 bytes
            // num_compile_errors // 4 bytes
            compileErrors: [
                'compile 1' // 10 bytes
            ],
            // num_runtime_errors // 4 bytes
            runtimeErrors: [
                'runtime 1' // 10 bytes
            ],
            // num_other_errors // 4 bytes
            otherErrors: [
                'other 1' // 8 bytes
            ]
        });
    });

    it('Handles zero errors', () => {
        const command = BreakpointErrorUpdate.fromJson({
            breakpointId: 3,
            compileErrors: [],
            runtimeErrors: [],
            otherErrors: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.BreakpointError,

            breakpointId: 3,
            compileErrors: [],
            runtimeErrors: [],
            otherErrors: []
        });

        expect(
            BreakpointErrorUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 36, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.BreakpointError, // 4 bytes

            //flags // 4 bytes

            breakpointId: 3, // 4 bytes
            // num_compile_errors // 4 bytes
            compileErrors: [],
            // num_runtime_errors // 4 bytes
            runtimeErrors: [],
            // num_other_errors // 4 bytes
            otherErrors: []
        });
    });
});
