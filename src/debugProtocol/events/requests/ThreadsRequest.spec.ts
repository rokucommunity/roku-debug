import { expect } from 'chai';
import { Command } from '../../Constants';
import { ThreadsRequest } from './ThreadsRequest';

describe('ThreadsRequest', () => {
    it('serializes and deserializes properly without identity info', () => {
        const command = ThreadsRequest.fromJson({
            requestId: 3
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Threads,
            includeIdentityInfo: false
        });

        expect(
            ThreadsRequest.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 12, // 4 bytes
            requestId: 3, // 4 bytes
            command: Command.Threads, // 4 bytes
            includeIdentityInfo: false
        });
    });

    it('defaults includeIdentityInfo to false when omitted', () => {
        const command = ThreadsRequest.fromJson({
            requestId: 3
        });
        expect(command.data.includeIdentityInfo).to.be.false;
    });

    it('omits the flags word from the buffer when includeIdentityInfo is false', () => {
        const command = ThreadsRequest.fromJson({
            requestId: 3,
            includeIdentityInfo: false
        });
        //no flags written, so the buffer is just the 12-byte common header
        expect(command.toBuffer()).to.have.lengthOf(12);
    });

    it('serializes and deserializes properly with identity info', () => {
        const command = ThreadsRequest.fromJson({
            requestId: 3,
            includeIdentityInfo: true
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            command: Command.Threads,
            includeIdentityInfo: true
        });

        //the flags word is appended (12-byte header + 4-byte flags)
        const buffer = command.toBuffer();
        expect(buffer).to.have.lengthOf(16);

        expect(
            ThreadsRequest.fromBuffer(buffer).data
        ).to.eql({
            packetLength: 16, // 4 (header) + 4 (requestId) + 4 (command) + 4 (flags)
            requestId: 3,
            command: Command.Threads,
            includeIdentityInfo: true
        });
    });
});
