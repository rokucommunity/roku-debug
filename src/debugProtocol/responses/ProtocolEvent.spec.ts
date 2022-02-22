import { ProtocolEvent } from './ProtocolEvent';
import { createProtocolEvent } from './responseCreationHelpers.spec';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { ERROR_CODES, UPDATE_TYPES } from '../Constants';
const sinon = createSandbox();

describe('ProtocolEvent', () => {
    it('Handles a Protocol update events', () => {
        let mockResponse = createProtocolEvent({
            requestId: 0,
            errorCode: ERROR_CODES.CANT_CONTINUE,
            updateType: UPDATE_TYPES.ALL_THREADS_STOPPED
        });

        let protocolEvent = new ProtocolEvent(mockResponse.toBuffer());
        expect(protocolEvent.requestId).to.be.equal(0);
        expect(protocolEvent.errorCode).to.be.equal(ERROR_CODES.CANT_CONTINUE);
        expect(protocolEvent.updateType).to.be.equal(UPDATE_TYPES.ALL_THREADS_STOPPED);
        expect(protocolEvent.readOffset).to.be.equal(mockResponse.writeOffset);
        expect(protocolEvent.success).to.be.equal(true);
    });

    it('Handles a Protocol response events', () => {
        let mockResponse = createProtocolEvent({
            requestId: 1,
            errorCode: ERROR_CODES.OK
        });

        let protocolEvent = new ProtocolEvent(mockResponse.toBuffer());
        expect(protocolEvent.requestId).to.be.equal(1);
        expect(protocolEvent.errorCode).to.be.equal(ERROR_CODES.OK);
        expect(protocolEvent.updateType).to.be.equal(-1);
        expect(protocolEvent.readOffset).to.be.equal(mockResponse.writeOffset);
        expect(protocolEvent.success).to.be.equal(true);
    });

    // it('Fails when buffer is incomplete', () => {
    //     let mockResponse = createHandShakeResponse({
    //         magic: Debugger.DEBUGGER_MAGIC,
    //         major: 1,
    //         minor: 0,
    //         patch: 0
    //     });

    //     let handshake = new HandshakeResponse(mockResponse.toBuffer().slice(-3));
    //     expect(handshake.success).to.equal(false);
    // });

    // it('Fails when the protocol version is equal to or greater then 3.0.0', () => {
    //     let mockResponseV3 = createHandShakeResponse({
    //         magic: Debugger.DEBUGGER_MAGIC,
    //         major: 3,
    //         minor: 0,
    //         patch: 0
    //     });

    //     let handshakeV3 = new HandshakeResponse(mockResponseV3.toBuffer());
    //     expect(handshakeV3.success).to.equal(false);

    //     let mockResponseV301 = createHandShakeResponse({
    //         magic: Debugger.DEBUGGER_MAGIC,
    //         major: 3,
    //         minor: 0,
    //         patch: 1
    //     });

    //     let handshakeV301 = new HandshakeResponse(mockResponseV301.toBuffer());
    //     expect(handshakeV301.success).to.equal(false);
    // });
});
