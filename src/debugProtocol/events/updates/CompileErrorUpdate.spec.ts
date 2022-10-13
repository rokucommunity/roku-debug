import { expect } from 'chai';
import { ErrorCode, UpdateType } from '../../Constants';
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
            errorCode: ErrorCode.OK,
            updateType: UpdateType.CompileError,

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
            errorCode: ErrorCode.OK, // 4 bytes
            updateType: UpdateType.CompileError, // 4 bytes

            errorMessage: 'crashed', // 8 bytes
            filePath: 'pkg:/source/main.brs', // 21 bytes
            libraryName: 'complib1', // 9 bytes
            lineNumber: 3 // 4 bytes
        });
    });
});
