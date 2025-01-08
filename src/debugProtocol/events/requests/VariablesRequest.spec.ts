import { expect } from 'chai';
import { Command } from '../../Constants';
import { VariablesRequest } from './VariablesRequest';

describe('VariablesRequest', () => {
    it('serializes and deserializes properly for unsupported forceCaseSensitivity lookups', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: true,
            enableForceCaseInsensitivity: false,
            getVirtualKeys: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: true, isVirtual: false },
                { name: 'b', forceCaseInsensitive: true, isVirtual: false },
                { name: 'c', forceCaseInsensitive: true, isVirtual: false }
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: true,
            enableForceCaseInsensitivity: false,
            getVirtualKeys: false,
            includesVirtualPath: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: false, isVirtual: false },
                { name: 'b', forceCaseInsensitive: false, isVirtual: false },
                { name: 'c', forceCaseInsensitive: false, isVirtual: false }
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
            enableForceCaseInsensitivity: false, // 0 bytes
            getVirtualKeys: false,
            includesVirtualPath: false,
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: false, isVirtual: false }, // 2 bytes
                { name: 'b', forceCaseInsensitive: false, isVirtual: false }, // 2 bytes
                { name: 'c', forceCaseInsensitive: false, isVirtual: false } // 2 bytes
            ]
        });
    });

    it('serializes and deserializes properly for case insensitivesensitive lookups', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: false,
            enableForceCaseInsensitivity: true,
            getVirtualKeys: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: true, isVirtual: false },
                { name: 'b', forceCaseInsensitive: false, isVirtual: false },
                { name: 'c', forceCaseInsensitive: true, isVirtual: false }
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: false,
            enableForceCaseInsensitivity: true,
            getVirtualKeys: false,
            includesVirtualPath: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: true, isVirtual: false },
                { name: 'b', forceCaseInsensitive: false, isVirtual: false },
                { name: 'c', forceCaseInsensitive: true, isVirtual: false }
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
            enableForceCaseInsensitivity: true, // 0 bytes
            getVirtualKeys: false,
            includesVirtualPath: false,
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: [
                {
                    name: 'a', // 2 bytes
                    forceCaseInsensitive: true, // 1 byte
                    isVirtual: false // 0 byte
                }, // ?
                {
                    name: 'b', // 2 bytes
                    forceCaseInsensitive: false, // 1 byte
                    isVirtual: false // 0 byte
                }, // ?
                {
                    name: 'c', // 2 bytes
                    forceCaseInsensitive: true, // 1 byte
                    isVirtual: false // 0 byte
                } // ?
            ]
        });
    });

    it('serializes and deserializes properly for case isVirtual lookups', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: false,
            enableForceCaseInsensitivity: true,
            getVirtualKeys: true,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: true, isVirtual: true },
                { name: 'b', forceCaseInsensitive: false, isVirtual: false },
                { name: 'c', forceCaseInsensitive: true, isVirtual: true }
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: false,
            enableForceCaseInsensitivity: true,
            getVirtualKeys: true,
            includesVirtualPath: true,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: [
                { name: 'a', forceCaseInsensitive: true, isVirtual: true },
                { name: 'b', forceCaseInsensitive: false, isVirtual: false },
                { name: 'c', forceCaseInsensitive: true, isVirtual: true }
            ]
        });

        expect(
            VariablesRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 37, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Variables, // 4 bytes,

            //variable_request_flags // 1 byte
            getChildKeys: false, // 0 bytes
            enableForceCaseInsensitivity: true, // 0 bytes
            getVirtualKeys: true, // 0 bytes
            includesVirtualPath: true, // 0 bytes
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: [
                {
                    name: 'a', // 2 bytes
                    forceCaseInsensitive: true, // 1 byte
                    isVirtual: true // 1 byte
                }, // ?
                {
                    name: 'b', // 2 bytes
                    forceCaseInsensitive: false, // 1 byte
                    isVirtual: false // 1 byte
                }, // ?
                {
                    name: 'c', // 2 bytes
                    forceCaseInsensitive: true, // 1 byte
                    isVirtual: true // 1 byte
                } // ?
            ]
        });
    });

    it('supports empty variables list', () => {
        const command = VariablesRequest.fromJson({
            requestId: 3,
            getChildKeys: false,
            enableForceCaseInsensitivity: true,
            getVirtualKeys: false,
            stackFrameIndex: 1,
            threadIndex: 2,
            variablePathEntries: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Variables,

            getChildKeys: false,
            enableForceCaseInsensitivity: true,
            getVirtualKeys: false,
            includesVirtualPath: false,
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
            enableForceCaseInsensitivity: true, // 0 bytes
            getVirtualKeys: false,
            includesVirtualPath: false,
            stackFrameIndex: 1, // 4 bytes
            threadIndex: 2, // 4 bytes
            // variable_path_len // 4 bytes
            variablePathEntries: []
        });
    });
});
