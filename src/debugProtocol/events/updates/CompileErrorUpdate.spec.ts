import { expect } from 'chai';
import { ERROR_CODES, StopReasonCode, UPDATE_TYPES } from '../../Constants';
import { CompileErrorUpdate } from './CompileErrorUpdate';

describe('CompileErrorUpdate', () => {
    it('serializes and deserializes properly', () => {
        const command = CompileErrorUpdate.fromJson({
            errorMessage: 'crashed',
            filePath: 'pkg:/source/main.brs',
            libraryName: 'complib1',
            lineNumber: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 0,
            errorCode: ERROR_CODES.OK,
            updateType: UPDATE_TYPES.COMPILE_ERROR,

            errorMessage: 'crashed',
            filePath: 'pkg:/source/main.brs',
            libraryName: 'complib1',
            lineNumber: 3
        });

        expect(
            CompileErrorUpdate.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 58, // 4 bytes
            requestId: 0, // 4 bytes
            errorCode: ERROR_CODES.OK, // 4 bytes
            updateType: UPDATE_TYPES.COMPILE_ERROR, // 4 bytes

            errorMessage: 'crashed', // 8 bytes
            filePath: 'pkg:/source/main.brs', // 21 bytes
            libraryName: 'complib1', // 9 bytes
            lineNumber: 3 // 4 bytes
        });
    });
});
