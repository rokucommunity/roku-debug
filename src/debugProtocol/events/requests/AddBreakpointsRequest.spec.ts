import { expect } from 'chai';
import { COMMANDS } from '../../Constants';
import { AddBreakpointsRequest } from './AddBreakpointsRequest';

describe('AddBreakpointsRequest', () => {
    it('serializes and deserializes properly with zero breakpoints', () => {
        const command = AddBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.ADD_BREAKPOINTS,

            breakpoints: []
        });

        expect(
            AddBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.ADD_BREAKPOINTS, // 4 bytes

            // num_breakpoints // 4 bytes
            breakpoints: []
        });
    });

    it('serializes and deserializes properly with breakpoints', () => {
        const command = AddBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: [{
                filePath: 'source/main.brs',
                ignoreCount: 3,
                lineNumber: 1
            },
            {
                filePath: 'source/main.brs',
                ignoreCount: undefined, //we default to 0
                lineNumber: 2
            }]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            commandCode: COMMANDS.CONTINUE,

            breakpoints: [{
                filePath: 'source/main.brs',
                ignoreCount: 3,
                lineNumber: 1
            },
            {
                filePath: 'source/main.brs',
                ignoreCount: 0,
                lineNumber: 2
            }]
        });

        expect(
            AddBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 64, // 4 bytes
            requestId: 3, // 4 bytes
            commandCode: COMMANDS.CONTINUE, // 4 bytes

            // num_breakpoints // 4 bytes
            breakpoints: [{
                filePath: 'source/main.brs', // 16 bytes
                ignoreCount: 3, // 4 bytes
                lineNumber: 1 // 4 bytes
            },
            {
                filePath: 'source/main.brs', // 16 bytes
                ignoreCount: 0, // 4 bytes
                lineNumber: 2 // 4 bytes
            }]
        });
    });
});
