import { expect } from 'chai';
import { ErrorCode, UpdateType } from '../../Constants';
import { ExceptionBreakpointErrorUpdate } from './ExceptionBreakpointErrorUpdate';

describe('ExceptionBreakpointErrorUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = ExceptionBreakpointErrorUpdate.fromJson({
            filterId: 3,
            compileErrors: [
                'compile 1'
            ],
            runtimeErrors: [
                'runtime 1'
            ],
            otherErrors: [
                'other 1'
            ],
            lineNumber: 5,
            filePath: 'pkg:/source/main.brs'
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.BreakpointError,

            filterId: 3,
            compileErrors: [
                'compile 1'
            ],
            runtimeErrors: [
                'runtime 1'
            ],
            otherErrors: [
                'other 1'
            ],
            lineNumber: 5,
            filePath: 'pkg:/source/main.brs'
        });

        expect(
            ExceptionBreakpointErrorUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 89, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.BreakpointError, // 4 bytes

            //flags // 4 bytes

            filterId: 3, // 4 bytes
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
            ],
            lineNumber: 5, //4 bytes
            filePath: 'pkg:/source/main.brs' // 21 bytes
        });
    });

    it('Handles zero errors', () => {
        const command = ExceptionBreakpointErrorUpdate.fromJson({
            filterId: 0,
            compileErrors: [],
            runtimeErrors: [],
            otherErrors: [],
            lineNumber: 5,
            filePath: 'pkg:/source/main.brs'
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ErrorCode.OK,
            updateType: UpdateType.BreakpointError,

            filterId: 0,
            compileErrors: [],
            runtimeErrors: [],
            otherErrors: [],
            lineNumber: 5,
            filePath: 'pkg:/source/main.brs'
        });

        expect(
            ExceptionBreakpointErrorUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 61, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.BreakpointError, // 4 bytes

            //flags // 4 bytes

            filterId: 0, // 4 bytes
            // num_compile_errors // 4 bytes
            compileErrors: [],
            // num_runtime_errors // 4 bytes
            runtimeErrors: [],
            // num_other_errors // 4 bytes
            otherErrors: [],
            lineNumber: 5, //4 bytes
            filePath: 'pkg:/source/main.brs' // 21 bytes
        });
    });
});
