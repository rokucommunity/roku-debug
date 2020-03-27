// tslint:disable: no-floating-promises
import { BrightScriptDebugger } from './BrightScriptDebugger';
import * as net from 'net';
import { expect } from 'chai';
import { EventEmitter } from 'events';
import { SmartBuffer } from 'smart-buffer';
import { util } from './util';
import { MockBrightScriptDebugServer } from './MockBrightScriptDebugServer.spec';
import * as sinonImport from 'sinon';
var sinon = sinonImport.createSandbox();

describe('BrightScriptDebugger', () => {
    var bsDebugger: BrightScriptDebugger;
    var roku: MockBrightScriptDebugServer;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args ) => {});
        roku = new MockBrightScriptDebugServer();
        await roku.initialize();

        bsDebugger = new BrightScriptDebugger({
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
            var action = roku.waitForMagic();
            bsDebugger.connect();
            roku.processActions();
            var magic = await action.promise;
            expect(magic).to.equal(BrightScriptDebugger.DEBUGGER_MAGIC);
            console.log('test finished');
        });

        it('validates magic from server on connect', async () => {
            var magicAction = roku.waitForMagic();
            var action = roku.sendHandshakeResponse(magicAction.promise);

            bsDebugger.connect();

            roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.true;
        });

        it('throws on magic mismatch', async () => {
            var magicAction = roku.waitForMagic();
            var action = roku.sendHandshakeResponse('not correct magic');

            bsDebugger.connect();

            roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.false;
        });
    });
});
