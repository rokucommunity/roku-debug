import { expect } from 'chai';
import { Command } from '../../Constants';
import { SetExceptionsBreakpointsRequest } from './SetExceptionsBreakpointsRequest';

describe('SetExceptionsBreakpointsRequest', () => {
    it('serializes and deserializes properly with zero breakpoints', () => {
        const command = SetExceptionsBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.SetExceptionsBreakpoints,

            breakpoints: []
        });

        expect(
            SetExceptionsBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 16, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.SetExceptionsBreakpoints, // 4 bytes

            // num_breakpoints // 4 bytes
            breakpoints: []
        });
    });

    it('serializes and deserializes properly with breakpoints', () => {
        const command = SetExceptionsBreakpointsRequest.fromJson({
            requestId: 3,
            breakpoints: [{
                filter: 0,
                conditionExpression: 'some conditions'
            },
            {
                filter: 0,
                conditionExpression: ''
            }]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.SetExceptionsBreakpoints,

            breakpoints: [{
                filter: 0,
                conditionExpression: 'some conditions'
            },
            {
                filter: 0,
                conditionExpression: ''
            }]
        });

        expect(
            SetExceptionsBreakpointsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 41, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.SetExceptionsBreakpoints, // 4 bytes
            // num_breakpoints // 4 bytes
            breakpoints: [{
                filter: 0,
                conditionExpression: 'some conditions'
            },
            {
                filter: 0,
                conditionExpression: ''
            }]
        });
    });
});
