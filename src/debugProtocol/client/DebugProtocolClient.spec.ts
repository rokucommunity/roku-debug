/* eslint-disable no-bitwise */
import { DebugProtocolClient } from './DebugProtocolClient';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { Command, ErrorCode, StepType, StopReason } from '../Constants';
import { DebugProtocolServer } from '../server/DebugProtocolServer';
import * as portfinder from 'portfinder';
import { util } from '../../util';
import { HandshakeRequest } from '../events/requests/HandshakeRequest';
import { HandshakeResponse } from '../events/responses/HandshakeResponse';
import { HandshakeV3Response } from '../events/responses/HandshakeV3Response';
import { AllThreadsStoppedUpdate } from '../events/updates/AllThreadsStoppedUpdate';
import { VariablesResponse } from '../events/responses/VariablesResponse';
import { VariablesRequest } from '../events/requests/VariablesRequest';
import { DebugProtocolServerTestPlugin } from '../DebugProtocolServerTestPlugin.spec';
import { ContinueRequest } from '../events/requests/ContinueRequest';
import { GenericV3Response } from '../events/responses/GenericV3Response';
import { StopRequest } from '../events/requests/StopRequest';
import { ExitChannelRequest } from '../events/requests/ExitChannelRequest';
import { StepRequest } from '../events/requests/StepRequest';
import { ThreadsResponse } from '../events/responses/ThreadsResponse';

const sinon = createSandbox();

describe('DebugProtocolClient', () => {
    let server: DebugProtocolServer;
    let client: DebugProtocolClient;
    let plugin: DebugProtocolServerTestPlugin;

    /**
     * Helper function to simplify the initial connect flow
     */
    async function connect() {
        await client.connect();
        //send the AllThreadsStopped event, and also wait for the client to suspend
        await Promise.all([
            server.sendUpdate(AllThreadsStoppedUpdate.fromJson({
                threadIndex: 2,
                stopReason: StopReason.Break,
                stopReasonDetail: 'because'
            })),
            await client.once('suspend')
        ]);
    }

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
        plugin = server.plugins.add(new DebugProtocolServerTestPlugin());
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

    it('knows when to enable the thread hopping workaround', () => {
        //only supported below version 3.1.0
        client.protocolVersion = '1.0.0';
        expect(
            client['enableThreadHoppingWorkaround']
        ).to.be.true;

        client.protocolVersion = '3.0.0';
        expect(
            client['enableThreadHoppingWorkaround']
        ).to.be.true;

        client.protocolVersion = '3.1.0';
        expect(
            client['enableThreadHoppingWorkaround']
        ).to.be.false;

        client.protocolVersion = '4.0.0';
        expect(
            client['enableThreadHoppingWorkaround']
        ).to.be.false;
    });

    it('does not crash on unspecified options', () => {
        const client = new DebugProtocolClient(undefined);
        //no exception means it passed
    });

    it('only sends the continue command when stopped', async () => {
        await connect();

        client.isStopped = false;
        await client.continue();
        expect(plugin.latestRequest).not.to.be.instanceof(ContinueRequest);

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        client.isStopped = true;
        await client.continue();
        expect(plugin.latestRequest).to.be.instanceOf(ContinueRequest);
    });

    it('sends the pause command when forced', async () => {
        await connect();

        client.isStopped = true;
        await client.pause(); //should do nothing
        expect(plugin.latestRequest).not.to.be.instanceof(StopRequest);

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        client.isStopped = false;
        await client.pause();
        expect(plugin.latestRequest).to.be.instanceOf(StopRequest);
    });

    it('sends the pause command when forced', async () => {
        await connect();

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        client.isStopped = true;
        await client.pause(true); //true means force
        expect(plugin.latestRequest).to.be.instanceOf(StopRequest);
    });

    it('sends the exitChannel command', async () => {
        await connect();

        plugin.pushResponse(GenericV3Response.fromJson({} as any));

        await client.exitChannel();

        expect(plugin.latestRequest).to.be.instanceOf(ExitChannelRequest);
    });

    it('stepIn defaults to client.primaryThread and can be overridden', async () => {
        await connect();
        client.primaryThread = 9;

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        await client.stepIn();
        expect(plugin.getLatestRequest<StepRequest>().data.threadIndex).to.eql(9);
        expect(plugin.getLatestRequest<StepRequest>().data.stepType).to.eql(StepType.Line);

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        await client.stepIn(5);
        expect(plugin.getLatestRequest<StepRequest>().data.threadIndex).to.eql(5);
        expect(plugin.getLatestRequest<StepRequest>().data.stepType).to.eql(StepType.Line);
    });

    it('stepOver defaults to client.primaryThread and can be overridden', async () => {
        await connect();
        client.primaryThread = 9;

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        await client.stepOver();
        expect(plugin.getLatestRequest<StepRequest>().data.threadIndex).to.eql(9);
        expect(plugin.getLatestRequest<StepRequest>().data.stepType).to.eql(StepType.Over);

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        await client.stepOver(5);
        expect(plugin.getLatestRequest<StepRequest>().data.threadIndex).to.eql(5);
        expect(plugin.getLatestRequest<StepRequest>().data.stepType).to.eql(StepType.Over);
    });

    it('stepOut defaults to client.primaryThread and can be overridden', async () => {
        await connect();
        client.primaryThread = 9;

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        await client.stepOut();
        expect(plugin.getLatestRequest<StepRequest>().data.threadIndex).to.eql(9);
        expect(plugin.getLatestRequest<StepRequest>().data.stepType).to.eql(StepType.Out);

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        await client.stepOut(5);
        expect(plugin.getLatestRequest<StepRequest>().data.threadIndex).to.eql(5);
        expect(plugin.getLatestRequest<StepRequest>().data.stepType).to.eql(StepType.Out);
    });

    it('stepOut defaults to client.primaryThread and can be overridden', async () => {
        await connect();

        plugin.pushResponse(GenericV3Response.fromJson({} as any));

        //does not send command because we're not stopped
        client.isStopped = false;
        await client.stepOut();
        expect(plugin.latestRequest).not.to.be.instanceof(StepRequest);
    });

    it('handles step cannot-continue response', async () => {
        await connect();

        plugin.pushResponse(GenericV3Response.fromJson({
            errorCode: ErrorCode.CANT_CONTINUE,
            requestId: 12
        }));

        let cannotContinuePromise = client.once('cannot-continue');

        client.isStopped = true;
        await client.stepOut();

        //if the cannot-continue event resolved, this test passed
        await cannotContinuePromise;
    });

    describe('threads()', () => {
        it('skips sending command when not stopped', async () => {
            await connect();

            client.isStopped = false;
            await client.threads();
            expect(plugin.latestRequest).not.to.be.instanceof(ThreadsResponse);
        });

        it('returns response even when error code is not ok', async () => {
            await connect();

            plugin.pushResponse(GenericV3Response.fromJson({
                errorCode: ErrorCode.CANT_CONTINUE,
                requestId: 12
            }));

            const response = await client.threads();
            expect(response.data.errorCode).to.eql(ErrorCode.CANT_CONTINUE);
        });
    });

    it('knows when to enable complib specific breakpoints', () => {
        //only supported on version 3.1.0 and above
        client.protocolVersion = '1.0.0';
        expect(
            client['enableComponentLibrarySpecificBreakpoints']
        ).to.be.false;

        client.protocolVersion = '3.0.0';
        expect(
            client['enableComponentLibrarySpecificBreakpoints']
        ).to.be.false;

        client.protocolVersion = '3.1.0';
        expect(
            client['enableComponentLibrarySpecificBreakpoints']
        ).to.be.true;

        client.protocolVersion = '4.0.0';
        expect(
            client['enableComponentLibrarySpecificBreakpoints']
        ).to.be.true;
    });

    it('knows when to enable conditional breakpoints', () => {
        //only supported on version 3.1.0 and above
        client.protocolVersion = '1.0.0';
        expect(
            client['supportsConditionalBreakpoints']
        ).to.be.false;

        client.protocolVersion = '3.0.0';
        expect(
            client['supportsConditionalBreakpoints']
        ).to.be.false;

        client.protocolVersion = '3.1.0';
        expect(
            client['supportsConditionalBreakpoints']
        ).to.be.true;

        client.protocolVersion = '4.0.0';
        expect(
            client['supportsConditionalBreakpoints']
        ).to.be.true;
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
                    stopReason: StopReason.Break,
                    stopReasonDetail: 'test'
                })
            )
        ]);
        expect(event.data).include({
            threadIndex: 1,
            stopReason: StopReason.Break,
            stopReasonDetail: 'test'
        });
    });

    describe('getVariables', () => {
        it('honors protocol version when deciding to send forceCaseInsensitive variable information', async () => {
            await client.connect();
            //send the AllThreadsStopped event, and also wait for the client to suspend
            await Promise.all([
                server.sendUpdate(AllThreadsStoppedUpdate.fromJson({
                    threadIndex: 2,
                    stopReason: StopReason.Break,
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
