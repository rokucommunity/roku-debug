import { Debugger } from './Debugger';
import * as net from 'net';
import { expect } from 'chai';
import { EventEmitter } from 'events';
import { SmartBuffer } from 'smart-buffer';
import { util } from '../util';
import { MockDebugProtocolServer } from './MockDebugProtocolServer.spec';
import { createSandbox } from 'sinon';
import { createHandShakeResponse, createHandShakeResponseV3 } from './responses/responseCreationHelpers.spec';
const sinon = createSandbox();

describe('debugProtocol Debugger', () => {
    let bsDebugger: Debugger;
    let roku: MockDebugProtocolServer;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        roku = new MockDebugProtocolServer();
        await roku.initialize();

        bsDebugger = new Debugger({
            host: 'localhost',
            controllerPort: roku.controllerPort
        });
    });

    afterEach(() => {
        bsDebugger?.destroy();
        bsDebugger = undefined;
        sinon.restore();
        roku.destroy();
    });

    describe('connect', () => {
        it('sends magic to server on connect', async () => {
            let action = roku.waitForMagic();
            void bsDebugger.connect();
            void roku.processActions();
            let magic = await action.promise;
            expect(magic).to.equal(Debugger.DEBUGGER_MAGIC);
        });

        it('validates magic from server on connect', async () => {
            const magicAction = roku.waitForMagic();
            const action = roku.sendHandshakeResponse(magicAction.promise);

            void bsDebugger.connect();

            void roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.true;
        });

        it('throws on magic mismatch', async () => {
            const magicAction = roku.waitForMagic();
            const action = roku.sendHandshakeResponse('not correct magic');

            void bsDebugger.connect();

            void roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.false;
        });
    });

    describe('parseUnhandledData', () => {
        it('handles legacy handshake', () => {
            let mockResponse = createHandShakeResponse({
                magic: Debugger.DEBUGGER_MAGIC,
                major: 1,
                minor: 0,
                patch: 0
            });

            bsDebugger['unhandledData'] = mockResponse.toBuffer();

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(false);

            expect(bsDebugger['parseUnhandledData'](bsDebugger['unhandledData'])).to.be.equal(true);

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(true);
            expect(bsDebugger['unhandledData'].byteLength).to.be.equal(0);
        });

        it('handles v3 handshake', () => {
            let mockResponse = createHandShakeResponseV3({
                magic: Debugger.DEBUGGER_MAGIC,
                major: 3,
                minor: 0,
                patch: 0,
                revisionTimeStamp: Date.now()
            });

            bsDebugger['unhandledData'] = mockResponse.toBuffer();

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(false);

            expect(bsDebugger['parseUnhandledData'](bsDebugger['unhandledData'])).to.be.equal(true);

            expect(bsDebugger.watchPacketLength).to.be.equal(true);
            expect(bsDebugger.handshakeComplete).to.be.equal(true);
            expect(bsDebugger['unhandledData'].byteLength).to.be.equal(0);
        });
    });
});
