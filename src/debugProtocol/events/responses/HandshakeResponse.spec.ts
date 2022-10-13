import { HandshakeResponse } from './HandshakeResponse';
import { DebugProtocolClient } from '../../client/DebugProtocolClient';
import { expect } from 'chai';
import { HandshakeRequest } from '../requests/HandshakeRequest';
import { ErrorCode } from '../../Constants';

describe('HandshakeResponse', () => {
    it('Handles a handshake response', () => {
        const response = HandshakeResponse.fromJson({
            magic: 'not bsdebug',
            protocolVersion: '1.0.0'
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            requestId: HandshakeRequest.REQUEST_ID,
            errorCode: ErrorCode.OK,

            magic: 'not bsdebug',
            protocolVersion: '1.0.0'
        });

        expect(
            HandshakeResponse.fromBuffer(response.toBuffer()).data
        ).to.eql({
            packetLength: undefined,
            requestId: HandshakeRequest.REQUEST_ID,
            errorCode: ErrorCode.OK,

            magic: 'not bsdebug', // 12 bytes
            protocolVersion: '1.0.0' // 12 bytes (each number is sent as uint32)
        });

        expect(response.toBuffer().length).to.eql(24);
    });

    it('Fails when buffer is incomplete', () => {
        let handshake = HandshakeResponse.fromBuffer(
            //create a response
            HandshakeResponse.fromJson({
                magic: DebugProtocolClient.DEBUGGER_MAGIC,
                protocolVersion: '1.0.0'
                //slice a few bytes off the end
            }).toBuffer().slice(-3)
        );
        expect(handshake.success).to.equal(false);
    });

    it('Fails when the protocol version is equal to or greater then 3.0.0', () => {
        const response = HandshakeResponse.fromJson({
            magic: 'not bsdebug',
            protocolVersion: '3.0.0'
        });

        let handshakeV3 = HandshakeResponse.fromBuffer(response.toBuffer());
        expect(handshakeV3.success).to.equal(false);
    });
});
