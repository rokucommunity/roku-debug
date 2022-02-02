import { HandshakeResponseV3 } from './HandshakeResponseV3';
import { Debugger } from '../Debugger';
import { createHandShakeResponseV3 } from './responseCreationHelpers.spec';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { SmartBuffer } from 'smart-buffer';
const sinon = createSandbox();

describe('HandshakeResponseV3', () => {
    it('Handles a handshake response', () => {
        let mockResponse = createHandShakeResponseV3({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 3,
            minor: 0,
            patch: 0,
            revisionTimeStamp: Date.now()
        });

        let handshake = new HandshakeResponseV3(mockResponse.toBuffer());
        expect(handshake.magic).to.be.equal(Debugger.DEBUGGER_MAGIC);
        expect(handshake.majorVersion).to.be.equal(3);
        expect(handshake.minorVersion).to.be.equal(0);
        expect(handshake.patchVersion).to.be.equal(0);
        expect(handshake.readOffset).to.be.equal(mockResponse.writeOffset);
        expect(handshake.success).to.be.equal(true);
    });

    it('Handles a extra packet length in handshake response', () => {
        let extraData = new SmartBuffer();
        extraData.writeStringNT('this is extra data');
        extraData.writeUInt32LE(10);

        let mockResponse = createHandShakeResponseV3({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 3,
            minor: 0,
            patch: 0,
            revisionTimeStamp: Date.now()
        }, extraData.toBuffer());

        const expectedReadOffset = mockResponse.writeOffset;

        // Write some extra data that the handshake should not include in the readOffSet
        mockResponse.writeUInt32LE(123);

        let handshake = new HandshakeResponseV3(mockResponse.toBuffer());
        expect(handshake.magic).to.be.equal(Debugger.DEBUGGER_MAGIC);
        expect(handshake.majorVersion).to.be.equal(3);
        expect(handshake.minorVersion).to.be.equal(0);
        expect(handshake.patchVersion).to.be.equal(0);
        expect(handshake.readOffset).to.be.equal(expectedReadOffset);
        expect(handshake.success).to.be.equal(true);
    });

    it('Fails when buffer is incomplete', () => {
        let mockResponse = createHandShakeResponseV3({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 3,
            minor: 0,
            patch: 0,
            revisionTimeStamp: Date.now()
        });

        let handshake = new HandshakeResponseV3(mockResponse.toBuffer().slice(-3));
        expect(handshake.success).to.equal(false);
    });

    it('Fails when the protocol version is less then 3.0.0', () => {
        let mockResponseV3 = createHandShakeResponseV3({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 2,
            minor: 0,
            patch: 0,
            revisionTimeStamp: Date.now()
        });

        let handshakeV3 = new HandshakeResponseV3(mockResponseV3.toBuffer());
        expect(handshakeV3.success).to.equal(false);

        let mockResponseV301 = createHandShakeResponseV3({
            magic: Debugger.DEBUGGER_MAGIC,
            major: 2,
            minor: 9,
            patch: 9,
            revisionTimeStamp: Date.now()
        });

        let handshakeV301 = new HandshakeResponseV3(mockResponseV301.toBuffer());
        expect(handshakeV301.success).to.equal(false);
    });
});
