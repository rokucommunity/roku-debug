import { expect } from 'chai';
import { Command } from '../../Constants';
import { SetExceptionBreakpointsRequest } from './SetExceptionBreakpointsRequest';

describe('SetExceptionBreakpointsRequest', () => {
    it('serializes and deserializes properly with zero breakpoints', () => {
        const command = SetExceptionBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.SetExceptionBreakpoints,

            breakpoints: []
        });

        expect(
            SetExceptionBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.SetExceptionBreakpoints, // 4 bytes

            // num_breakpoints // 4 bytes
            breakpoints: []
        });
    });

    it('serializes and deserializes properly with breakpoints', () => {
        const command = SetExceptionBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: [{
                filter: 'caught',
                conditionExpression: 'some conditions'
            },
            {
                filter: 'uncaught',
                conditionExpression: ''
            }]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.SetExceptionBreakpoints,

            breakpoints: [{
                filter: 'caught',
                conditionExpression: 'some conditions'
            },
            {
                filter: 'uncaught',
                conditionExpression: ''
            }]
        });

        expect(
            SetExceptionBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 41, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.SetExceptionBreakpoints, // 4 bytes
            // num_breakpoints // 4 bytes
            breakpoints: [{
                filter: 'caught',
                conditionExpression: 'some conditions'
            },
            {
                filter: 'uncaught',
                conditionExpression: ''
            }]
        });
    });
});
