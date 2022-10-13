import { expect } from 'chai';
import { Command } from '../../Constants';
import { AddConditionalBreakpointsRequest } from './AddConditionalBreakpointsRequest';

describe('AddConditionalBreakpointsRequest', () => {
    it('serializes and deserializes properly with zero breakpoints', () => {
        const command = AddConditionalBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.AddConditionalBreakpoints,

            breakpoints: []
        });

        expect(
            AddConditionalBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 20, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.AddConditionalBreakpoints, // 4 bytes
            // flags // 4 bytes
            // num_breakpoints // 4 bytes
            breakpoints: []
        });
    });

    it('serializes and deserializes properly with breakpoints', () => {
        const command = AddConditionalBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: [{
                filePath: 'source/main.brs',
                ignoreCount: 3,
                lineNumber: 1,
                conditionalExpression: '1=1'
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
            command: Command.AddConditionalBreakpoints,

            breakpoints: [{
                filePath: 'source/main.brs',
                ignoreCount: 3,
                lineNumber: 1,
                conditionalExpression: '1=1'
            },
            {
                filePath: 'source/main.brs',
                ignoreCount: 0,
                lineNumber: 2,
                conditionalExpression: 'true'
            }]
        });

        expect(
            AddConditionalBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 77, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.AddConditionalBreakpoints, // 4 bytes

            //flags // 4 bytes

            // num_breakpoints // 4 bytes
            breakpoints: [{
                filePath: 'source/main.brs', // 16 bytes
                ignoreCount: 3, // 4 bytes
                lineNumber: 1, // 4 bytes
                conditionalExpression: '1=1' // 4 bytes
            },
            {
                filePath: 'source/main.brs', // 16 bytes
                ignoreCount: 0, // 4 bytes
                lineNumber: 2, // 4 bytes
                conditionalExpression: 'true' // 5 bytes
            }]
        });
    });
});
