import { DebugProtocolClient } from './DebugProtocolClient';
import { expect } from 'chai';
import type { SmartBuffer } from 'smart-buffer';
import { MockDebugProtocolServer } from '../MockDebugProtocolServer.spec';
import { createSandbox } from 'sinon';
import { createHandShakeResponse, createHandShakeResponseV3, createProtocolEventV3 } from '../events/zzresponsesOld/responseCreationHelpers.spec';
import { HandshakeResponse, HandshakeResponseV3, ProtocolEventV3 } from '../events/zzresponsesOld';
import { ERROR_CODES, StopReasonCode, UPDATE_TYPES, VARIABLE_REQUEST_FLAGS } from '../Constants';
import { DebugProtocolServer, DebugProtocolServerOptions } from '../server/DebugProtocolServer';
import * as portfinder from 'portfinder';
import { util } from '../../util';
import type { BeforeSendResponseEvent, ProtocolPlugin, ProvideResponseEvent } from '../server/ProtocolPlugin';
import { Handler, OnClientConnectedEvent, ProvideRequestEvent } from '../server/ProtocolPlugin';
import type { ProtocolResponse } from './events/zzresponsesOld/ProtocolResponse';
import type { ProtocolRequest } from './events/requests/ProtocolRequest';
import { HandshakeRequest } from '../events/requests/HandshakeRequest';
import { AllThreadsStoppedUpdateResponse } from '../events/updates/AllThreadsStoppedUpdate';

const sinon = createSandbox();

describe('DebugProtocolClient', () => {
    let bsDebugger: DebugProtocolClient;
    let roku: MockDebugProtocolServer;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        roku = new MockDebugProtocolServer();
        await roku.initialize();

        bsDebugger = new DebugProtocolClient({
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
            expect(magic).to.equal(DebugProtocolClient.DEBUGGER_MAGIC);
        });

        it('validates magic from server on connect', async () => {
            const magicAction = roku.waitForMagic();
            roku.sendHandshakeResponse(magicAction.promise);

            void bsDebugger.connect();

            void roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.true;
        });
    });

    describe('getVariables', () => {
        function getVariablesRequestBufferToJson(buffer: SmartBuffer) {
            const result = {
                flags: buffer.readUInt8(),
                threadIndex: buffer.readUInt32LE(),
                stackFrameIndex: buffer.readUInt32LE(),
                variablePathEntries: [],
                pathForceCaseInsensitive: []
            };

            const pathLength = buffer.readUInt32LE();
            if (pathLength > 0) {
                result.variablePathEntries = [];
                for (let i = 0; i < pathLength; i++) {
                    result.variablePathEntries.push(
                        buffer.readBufferNT().toString()
                    );
                }
            }
            // eslint-disable-next-line no-bitwise
            if (result.flags & VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS) {
                result.pathForceCaseInsensitive = [];
                for (let i = 0; i < pathLength; i++) {
                    result.pathForceCaseInsensitive.push(
                        buffer.readUInt8() === 0 ? false : true
                    );
                }
            }
            return result;
        }

        it('skips case sensitivity info on lower protocol versions', async () => {
            bsDebugger.protocolVersion = '2.0.0';
            bsDebugger['stopped'] = true;
            const stub = sinon.stub(bsDebugger as any, 'makeRequest').callsFake(() => { });
            await bsDebugger.getVariables(['m', 'top'], false, 1, 2);
            expect(
                getVariablesRequestBufferToJson(stub.getCalls()[0].args[0])
            ).to.eql({
                flags: 0,
                stackFrameIndex: 1,
                threadIndex: 2,
                variablePathEntries: ['m', 'top'],
                //should be empty
                pathForceCaseInsensitive: []
            });
        });

        it('marks strings as case-sensitive', async () => {
            bsDebugger.protocolVersion = '3.1.0';
            bsDebugger['stopped'] = true;
            const stub = sinon.stub(bsDebugger as any, 'makeRequest').callsFake(() => { });
            await bsDebugger.getVariables(['m', 'top', '"someKey"', '""someKeyWithInternalQuotes""'], true, 1, 2);
            expect(
                getVariablesRequestBufferToJson(stub.getCalls()[0].args[0])
            ).to.eql({
                // eslint-disable-next-line no-bitwise
                flags: VARIABLE_REQUEST_FLAGS.GET_CHILD_KEYS | VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS,
                stackFrameIndex: 1,
                threadIndex: 2,
                variablePathEntries: ['m', 'top', 'someKey', '"someKeyWithInternalQuotes"'],
                //should be empty
                pathForceCaseInsensitive: [true, true, false, false]
            });
        });
    });
});

/**
 * A class that intercepts all debug server events and provides test data for them
 */
class TestPlugin implements ProtocolPlugin {
    /**
     * A list of responses to be sent by the server in this exact order.
     * One of these will be sent for every `provideResponse` event received.
     */
    private responseQueue: ProtocolResponse[] = [];

    /**
     * Adds a response to the queue, which should be returned from the server in first-in-first-out order, one for each request received by the server
     */
    public pushResponse(response: ProtocolResponse) {
        this.responseQueue.push(response);
    }

    /**
     * A running list of requests received by the server during this test
     */
    public readonly requests: ReadonlyArray<ProtocolRequest> = [];

    /**
     * A running list of responses sent by the server during this test
     */
    public readonly responses: ReadonlyArray<ProtocolResponse> = [];

    /**
     * Whenever the server receives a request, this event allows us to send back a response
     */
    provideResponse(event: ProvideResponseEvent) {
        //store the request for testing purposes
        (this.requests as Array<ProtocolRequest>).push(event.request);

        const response = this.responseQueue.shift();
        //if there's no response, AND this isn't the handshake, fail. (we want the protocol to handle the handshake most of the time)
        if (!response && !(event.request instanceof HandshakeRequest)) {
            throw new Error('There was no response available to send back');
        }
        event.response = response;
    }

    beforeSendResponse(event: BeforeSendResponseEvent) {
        //store the response for testing purposes
        (this.responses as Array<ProtocolResponse>).push(event.response);
    }
}

describe.skip('Debugger new tests', () => {
    let server: DebugProtocolServer;
    let client: DebugProtocolClient;
    let plugin: TestPlugin;
    const options = {
        controllerPort: undefined as number,
        host: '127.0.0.1'
    };

    beforeEach(async () => {
        if (!options.controllerPort) {
            options.controllerPort = await portfinder.getPortPromise();
        }
        server = new DebugProtocolServer(options);
        plugin = server.plugins.add(new TestPlugin());
        await server.start();

        client = new DebugProtocolClient(options);
        //disable logging for tests because they clutter the test output
        client['logger'].logLevel = 'off';
    });

    afterEach(async () => {
        client?.destroy();
        //shut down and destroy the server after each test
        await server?.stop();
        await util.sleep(10);
    });

    it('handles v3 handshake', async () => {
        //these are false by default
        expect(client.watchPacketLength).to.be.equal(false);
        expect(client.isHandshakeComplete).to.be.equal(false);

        await client.connect();
        expect(plugin.responses[0].data).to.eql({
            magic: 'bsdebug',
            majorVersion: 3,
            minorVersion: 1,
            patchVersion: 0,
            revisionTimeStamp: new Date(2022, 1, 1)
        } as HandshakeResponseV3['data']);

        //version 3.0 includes packet length, so these should be true now
        expect(client.watchPacketLength).to.be.equal(true);
        expect(client.isHandshakeComplete).to.be.equal(true);
    });

    it('throws on magic mismatch', async () => {
        plugin.pushResponse(new HandshakeResponseV3({
            magic: 'not correct magic',
            majorVersion: 3,
            minorVersion: 1,
            patchVersion: 0,
            revisionTimeStamp: new Date(2022, 1, 1)
        }));

        const verifyHandshakePromise = client.once('handshake-verified');

        await client.connect();

        //wait for the debugger to finish verifying the handshake
        expect(await verifyHandshakePromise).to.be.false;
    });

    it('handles legacy handshake', async () => {

        expect(client.watchPacketLength).to.be.equal(false);
        expect(client.isHandshakeComplete).to.be.equal(false);

        plugin.pushResponse(new HandshakeResponse({
            magic: DebugProtocolClient.DEBUGGER_MAGIC,
            majorVersion: 1,
            minorVersion: 0,
            patchVersion: 0
        }));

        await client.connect();

        expect(client.watchPacketLength).to.be.equal(false);
        expect(client.isHandshakeComplete).to.be.equal(true);
    });

    it('handles events after handshake', async () => {
        await client.connect();

        await server.sendUpdate(
            new AllThreadsStoppedUpdateResponse({
                primaryThreadIndex: 1,
                stopReason: StopReasonCode.Break,
                stopReasonDetail: 'test'
            })
        );
        const event = await client.once('suspend');
        expect(event.data).include({
            primaryThreadIndex: 1,
            stopReason: StopReasonCode.Break,
            stopReasonDetail: 'test'
        });
        // let protocolEvent = createProtocolEventV3({
        //     requestId: 0,
        //     errorCode: ERROR_CODES.CANT_CONTINUE,
        //     updateType: UPDATE_TYPES.ALL_THREADS_STOPPED
        // });

        // let mockResponse = new SmartBuffer();
        // mockResponse.writeBuffer(handshake.toBuffer());
        // mockResponse.writeBuffer(protocolEvent.toBuffer());

        // bsDebugger['unhandledData'] = mockResponse.toBuffer();

        // const stub = sinon.stub(bsDebugger as any, 'removedProcessedBytes').callThrough();

        // expect(bsDebugger.watchPacketLength).to.be.equal(false);
        // expect(bsDebugger.handshakeComplete).to.be.equal(false);

        // expect(bsDebugger['parseUnhandledData'](bsDebugger['unhandledData'])).to.be.equal(true);

        // expect(bsDebugger.watchPacketLength).to.be.equal(true);
        // expect(bsDebugger.handshakeComplete).to.be.equal(true);
        // expect(bsDebugger['unhandledData'].byteLength).to.be.equal(0);

        // let calls = stub.getCalls();
        // expect(calls[0].args[0]).instanceOf(HandshakeResponseV3);
        // expect(calls[1].args[0]).instanceOf(ProtocolEventV3);
    });

});
