import { expect } from 'chai';
import { Command } from '../../Constants';
import { VariablesRequest } from './VariablesRequest';

describe('VariablesRequest', () => {
    it('serializes and deserializes properly for case sensitive lookups', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: true,
            enableCaseInsensitivityFlag: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', isCaseSensitive: false },
                { name: 'b', isCaseSensitive: false },
                { name: 'c', isCaseSensitive: false }
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: true,
            enableCaseInsensitivityFlag: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', isCaseSensitive: true },
                { name: 'b', isCaseSensitive: true },
                { name: 'c', isCaseSensitive: true }
            ]
        });

        expect(
            VariablesRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 31, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Variables, // 4 bytes,

            //variable_request_flags // 1 byte
            getChildKeys: true, // 0 bytes
            enableCaseInsensitivityFlag: false, // 0 bytes
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: [
                { name: 'a', isCaseSensitive: true }, // 2 bytes
                { name: 'b', isCaseSensitive: true }, // 2 bytes
                { name: 'c', isCaseSensitive: true } // 2 bytes
            ]
        });
    });

    it('serializes and deserializes properly for case insensitivesensitive lookups', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: false,
            enableCaseInsensitivityFlag: true,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', isCaseSensitive: false },
                { name: 'b', isCaseSensitive: true },
                { name: 'c', isCaseSensitive: false }
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: false,
            enableCaseInsensitivityFlag: true,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', isCaseSensitive: false },
                { name: 'b', isCaseSensitive: true },
                { name: 'c', isCaseSensitive: false }
            ]
        });

        expect(
            VariablesRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 34, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Variables, // 4 bytes,

            //variable_request_flags // 1 byte
            getChildKeys: false, // 0 bytes
            enableCaseInsensitivityFlag: true, // 0 bytes
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: [
                {
                    name: 'a', // 2 bytes
                    isCaseSensitive: false // 1 byte
                }, // ?
                {
                    name: 'b', // 2 bytes
                    isCaseSensitive: true // 1 byte
                }, // ?
                {
                    name: 'c', // 2 bytes
                    isCaseSensitive: false // 1 byte
                } // ?
            ]
        });
    });

    it('supports empty variables list', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: false,
            enableCaseInsensitivityFlag: true,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: false,
            enableCaseInsensitivityFlag: true,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: []
        });

        expect(
            VariablesRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 25, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Variables, // 4 bytes,

            //variable_request_flags // 1 byte
            getChildKeys: false, // 0 bytes
            enableCaseInsensitivityFlag: true, // 0 bytes
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: []
        });
    });
});
