import { HandshakeResponse } from './HandshakeResponse';
import { Debugger } from '../Debugger';
import { createHandShakeResponse } from './responseCreationHelpers.spec';
import { expect } from 'chai';

describe('HandshakeResponse', () => {
    it('Handles a handshake response', () => {
        let mockResponse = createHandShakeResponse({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 1,
            minor: 0,
            patch: 0
        });

        let handshake = new HandshakeResponse(mockResponse.toBuffer());
        expect(handshake.magic).to.be.equal(Debugger.DEBUGGER_MAGIC);
        expect(handshake.majorVersion).to.be.equal(1);
        expect(handshake.minorVersion).to.be.equal(0);
        expect(handshake.patchVersion).to.be.equal(0);
        expect(handshake.readOffset).to.be.equal(mockResponse.writeOffset);
        expect(handshake.success).to.be.equal(true);
    });

    it('Fails when buffer is incomplete', () => {
        let mockResponse = createHandShakeResponse({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 1,
            minor: 0,
            patch: 0
        });

        let handshake = new HandshakeResponse(mockResponse.toBuffer().slice(-3));
        expect(handshake.success).to.equal(false);
    });

    it('Fails when the protocol version is equal to or greater then 3.0.0', () => {
        let mockResponseV3 = createHandShakeResponse({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 3,
            minor: 0,
            patch: 0
        });

        let handshakeV3 = new HandshakeResponse(mockResponseV3.toBuffer());
        expect(handshakeV3.success).to.equal(false);

        let mockResponseV301 = createHandShakeResponse({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 3,
            minor: 0,
            patch: 1
        });

        let handshakeV301 = new HandshakeResponse(mockResponseV301.toBuffer());
        expect(handshakeV301.success).to.equal(false);
    });
});
