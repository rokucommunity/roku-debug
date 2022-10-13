/* eslint-disable no-bitwise */
import { DebugProtocolClient } from './DebugProtocolClient';
import { expect } from 'chai';
import type { SmartBuffer } from 'smart-buffer';
import { createSandbox } from 'sinon';
import { Command, ErrorCode, StopReasonCode } from '../Constants';
import { DebugProtocolServer } from '../server/DebugProtocolServer';
import * as portfinder from 'portfinder';
import { util } from '../../util';
import type { BeforeSendResponseEvent, ProtocolPlugin, ProvideResponseEvent } from '../server/ProtocolPlugin';
import { HandshakeRequest } from '../events/requests/HandshakeRequest';
import type { ProtocolResponse, ProtocolRequest } from '../events/ProtocolEvent';
import { HandshakeResponse } from '../events/responses/HandshakeResponse';
import { HandshakeV3Response } from '../events/responses/HandshakeV3Response';
import { AllThreadsStoppedUpdate } from '../events/updates/AllThreadsStoppedUpdate';
import { VariablesResponse } from '../events/responses/VariablesResponse';
import { VariableRequestFlag, VariablesRequest } from '../events/requests/VariablesRequest';

const sinon = createSandbox();

describe('DebugProtocolClient', () => {
    let server: DebugProtocolServer;
    let client: DebugProtocolClient;
    let plugin: TestPlugin;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args) => { });

        const options = {
            controllerPort: undefined as number,
            host: '127.0.0.1'
        };

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
        sinon.restore();
    });

    it('handles v3 handshake', async () => {
        //these are false by default
        expect(client.watchPacketLength).to.be.equal(false);
        expect(client.isHandshakeComplete).to.be.equal(false);

        await client.connect();
        expect(plugin.responses[0].data).to.eql({
            packetLength: undefined,
            requestId: HandshakeRequest.REQUEST_ID,
            errorCode: ErrorCode.OK,

            magic: 'bsdebug',
            protocolVersion: '3.1.0',
            revisionTimestamp: new Date(2022, 1, 1)
        } as HandshakeV3Response['data']);

        //version 3.0 includes packet length, so these should be true now
        expect(client.watchPacketLength).to.be.equal(true);
        expect(client.isHandshakeComplete).to.be.equal(true);
    });

    it('throws on magic mismatch', async () => {
        plugin.pushResponse(
            HandshakeV3Response.fromJson({
                magic: 'not correct magic',
                protocolVersion: '3.1.0',
                revisionTimestamp: new Date(2022, 1, 1)
            })
        );

        const verifyHandshakePromise = client.once('handshake-verified');

        await client.connect();

        //wait for the debugger to finish verifying the handshake
        expect(await verifyHandshakePromise).to.be.false;
    });

    it('handles legacy handshake', async () => {

        expect(client.watchPacketLength).to.be.equal(false);
        expect(client.isHandshakeComplete).to.be.equal(false);

        plugin.pushResponse(
            HandshakeResponse.fromJson({
                magic: DebugProtocolClient.DEBUGGER_MAGIC,
                protocolVersion: '1.0.0'
            })
        );

        await client.connect();

        expect(client.watchPacketLength).to.be.equal(false);
        expect(client.isHandshakeComplete).to.be.equal(true);
    });

    it('handles AllThreadsStoppedUpdate after handshake', async () => {
        await client.connect();

        const [, event] = await Promise.all([
            //wait for the client to suspend
            client.once('suspend'),
            //send an update which should cause the client to suspend
            server.sendUpdate(
                AllThreadsStoppedUpdate.fromJson({
                    threadIndex: 1,
                    stopReason: StopReasonCode.Break,
                    stopReasonDetail: 'test'
                })
            )
        ]);
        expect(event.data).include({
            threadIndex: 1,
            stopReason: StopReasonCode.Break,
            stopReasonDetail: 'test'
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
            if (result.flags & VariableRequestFlag.CaseSensitivityOptions) {
                result.pathForceCaseInsensitive = [];
                for (let i = 0; i < pathLength; i++) {
                    result.pathForceCaseInsensitive.push(
                        buffer.readUInt8() === 0 ? false : true
                    );
                }
            }
            return result;
        }

        it('honors protocol version when deciding to send forceCaseInsensitive variable information', async () => {
            await client.connect();
            //send the AllThreadsStopped event, and also wait for the client to suspend
            await Promise.all([
                server.sendUpdate(AllThreadsStoppedUpdate.fromJson({
                    threadIndex: 2,
                    stopReason: StopReasonCode.Break,
                    stopReasonDetail: 'because'
                })),
                await client.once('suspend')
            ]);

            // force the protocolVersion to 2.0.0 for this test
            client.protocolVersion = '2.0.0';

            plugin.pushResponse(VariablesResponse.fromJson({
                requestId: -1, // overridden in the plugin
                variables: []
            }));

            await client.getVariables(['m', '"top"'], 1, 2);
            expect(
                VariablesRequest.fromBuffer(plugin.latestRequest.toBuffer()).data
            ).to.eql({
                packetLength: 31,
                requestId: 1,
                command: Command.Variables,
                enableForceCaseInsensitivity: false,
                getChildKeys: true,
                stackFrameIndex: 1,
                threadIndex: 2,
                variablePathEntries: [{
                    name: 'm',
                    forceCaseInsensitive: false
                }, {
                    name: 'top',
                    forceCaseInsensitive: false
                }]
            } as VariablesRequest['data']);

            // force the protocolVersion to 3.1.0 for this test
            client.protocolVersion = '3.1.0';

            plugin.pushResponse(VariablesResponse.fromJson({
                requestId: -1, // overridden in the plugin
                variables: []
            }));

            await client.getVariables(['m', '"top"'], 1, 2);
            expect(
                VariablesRequest.fromBuffer(plugin.latestRequest.toBuffer()).data
            ).to.eql({
                packetLength: 33,
                requestId: 2,
                command: Command.Variables,
                enableForceCaseInsensitivity: true,
                getChildKeys: true,
                stackFrameIndex: 1,
                threadIndex: 2,
                variablePathEntries: [{
                    name: 'm',
                    forceCaseInsensitive: true
                }, {
                    name: 'top',
                    forceCaseInsensitive: false
                }]
            } as VariablesRequest['data']);
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
     * The most recent request received by the plugin
     */
    public get latestRequest() {
        return this.requests[this.requests.length - 1];
    }

    /**
     * A running list of responses sent by the server during this test
     */
    public readonly responses: ReadonlyArray<ProtocolResponse> = [];

    /**
     * The most recent response received by the plugin
     */
    public get latestResponse() {
        return this.responses[this.responses.length - 1];
    }

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
        //force this response to have the current request's ID (for testing purposes
        if (response) {
            response.data.requestId = event.request.data.requestId;
        }
        event.response = response;
    }

    beforeSendResponse(event: BeforeSendResponseEvent) {
        //store the response for testing purposes
        (this.responses as Array<ProtocolResponse>).push(event.response);
    }
}
