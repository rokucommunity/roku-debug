import { HandshakeV3Response } from './HandshakeV3Response';
import { DebugProtocolClient } from '../../client/DebugProtocolClient';
import { expect } from 'chai';
import { SmartBuffer } from 'smart-buffer';
import { ErrorCode } from '../../Constants';
import { HandshakeRequest } from '../requests/HandshakeRequest';
import { DEBUGGER_MAGIC } from '../../server/DebugProtocolServer';
import { expectThrows } from '../../../testHelpers.spec';

describe('HandshakeV3Response', () => {
    const date = new Date(2022, 0, 0);
    it('Handles a handshake response', () => {
        const response = HandshakeV3Response.fromJson({
            magic: 'bsdebug',
            protocolVersion: '3.0.0',
            revisionTimestamp: date
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: HandshakeRequest.REQUEST_ID,

            magic: 'bsdebug',
            protocolVersion: '3.0.0',
            revisionTimestamp: date
        });

        expect(
            HandshakeV3Response.fromBuffer(response.toBuffer()).data
        ).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: HandshakeRequest.REQUEST_ID,

            magic: 'bsdebug', // 8 bytes
            protocolVersion: '3.0.0', // 12 bytes (each number is sent as uint32)
            //remaining_packet_length // 4 bytes
            revisionTimestamp: date // 8 bytes (int64)
        });

        expect(response.toBuffer().length).to.eql(32);
    });

    it('Handles trailing buffer data in handshake response', () => {
        const response = HandshakeV3Response.fromJson({
            magic: 'bsdebug',
            protocolVersion: '3.0.0',
            revisionTimestamp: date
        });

        //write some extra data to the buffer
        const smartBuffer = SmartBuffer.fromBuffer(response.toBuffer());
        smartBuffer.writeStringNT('this is extra data', smartBuffer.length);

        const newResponse = HandshakeV3Response.fromBuffer(smartBuffer.toBuffer());
        expect(newResponse.success).to.be.true;

        expect(
            newResponse.data
        ).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: HandshakeRequest.REQUEST_ID,
            magic: 'bsdebug', // 8 bytes
            protocolVersion: '3.0.0', // 12 bytes (each number is sent as uint32)
            //remaining_packet_length // 4 bytes
            revisionTimestamp: date // 8 bytes (int64)
        });

        expect(newResponse.readOffset).to.eql(32);
    });

    it('uses default version when missing', () => {
        const handshake = HandshakeV3Response.fromJson({
            magic: DEBUGGER_MAGIC,
            protocolVersion: '1.2.3',
            revisionTimestamp: new Date()
        });
        handshake.data.protocolVersion = undefined;
        expect(
            HandshakeV3Response.fromBuffer(
                handshake.toBuffer()
            ).data.protocolVersion
        ).to.eql('0.0.0');
    });

    it('rejects if there was not enough buffer data', () => {
        const buffer = new SmartBuffer();
        buffer.writeStringNT(DEBUGGER_MAGIC);
        buffer.writeUInt32LE(1); // protocol_major_version
        buffer.writeUInt32LE(2); // protocol_minor_version
        buffer.writeUInt32LE(3); // protocol_patch_version
        buffer.writeUInt32LE(100); //remaining_packet_length. The exception is triggered because this is larger than the remaining buffer size
        buffer.writeBigUInt64LE(BigInt(123));
        const response = HandshakeV3Response.fromBuffer(buffer.toBuffer());
        expect(response).to.include({
            readOffset: 0,
            success: false
        });
    });

    it('Fails when buffer is incomplete', () => {
        let handshake = HandshakeV3Response.fromBuffer(
            //create a response
            HandshakeV3Response.fromJson({
                magic: DebugProtocolClient.DEBUGGER_MAGIC,
                protocolVersion: '1.0.0',
                revisionTimestamp: date
                //slice a few bytes off the end
            }).toBuffer().slice(-3)
        );
        expect(handshake.success).to.equal(false);
    });

    it('Fails when the protocol version is less then 3.0.0', () => {
        const response = HandshakeV3Response.fromJson({
            magic: 'not bsdebug',
            protocolVersion: '2.0.0',
            revisionTimestamp: date
        });

        let handshakeV3 = HandshakeV3Response.fromBuffer(response.toBuffer());
        expect(handshakeV3.success).to.equal(false);
    });

    it('parses properly with nonstandard magic', () => {
        const response = HandshakeV3Response.fromJson({
            magic: 'not correct magic',
            protocolVersion: '3.1.0',
            revisionTimestamp: date
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: HandshakeRequest.REQUEST_ID,

            magic: 'not correct magic',
            protocolVersion: '3.1.0',
            revisionTimestamp: date
        });

        expect(
            HandshakeV3Response.fromBuffer(response.toBuffer()).data
        ).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: HandshakeRequest.REQUEST_ID,

            magic: 'not correct magic', // 18 bytes
            protocolVersion: '3.1.0', // 12 bytes (each number is sent as uint32)
            //remaining_packet_length // 4 bytes
            revisionTimestamp: date // 8 bytes (int64)
        });

        expect(response.toBuffer().length).to.eql(42);
        const parsed = HandshakeV3Response.fromBuffer(response.toBuffer());
        expect(parsed.readOffset).to.eql(42);
    });
});
