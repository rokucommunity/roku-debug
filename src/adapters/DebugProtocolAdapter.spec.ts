
import { expect } from 'chai';
import { DebugProtocolClient } from '../debugProtocol/client/DebugProtocolClient';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import type { Variable } from '../debugProtocol/events/responses/VariablesResponse';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { VariablesResponse } from '../debugProtocol/events/responses/VariablesResponse';
import { DebugProtocolServer } from '../debugProtocol/server/DebugProtocolServer';
import { util } from '../util';
import { DebugProtocolServerTestPlugin } from '../debugProtocol/DebugProtocolServerTestPlugin.spec';
import { AllThreadsStoppedUpdate } from '../debugProtocol/events/updates/AllThreadsStoppedUpdate';
import { StopReason } from '../debugProtocol/Constants';
import { ThreadsResponse } from '../debugProtocol/events/responses/ThreadsResponse';
import { StackTraceV3Response } from '../debugProtocol/events/responses/StackTraceV3Response';

const sinon = createSandbox();

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;
    let server: DebugProtocolServer;
    let client: DebugProtocolClient;
    let plugin: DebugProtocolServerTestPlugin;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        const options = {
            controlPort: undefined as number,
            host: '127.0.0.1'
        };

        adapter = new DebugProtocolAdapter(options, undefined, undefined);

        if (!options.controlPort) {
            options.controlPort = await util.getPort();
        }
        server = new DebugProtocolServer(options);
        plugin = server.plugins.add(new DebugProtocolServerTestPlugin());
        await server.start();

        client = new DebugProtocolClient(options);
        //disable logging for tests because they clutter the test output
        client['logger'].logLevel = 'off';
    });

    afterEach(async () => {
        sinon.restore();
        client?.destroy();
        //shut down and destroy the server after each test
        await server?.stop();
        await util.sleep(10);
    });

    /**
     * Handles the initial connection and the "stop at first byte code" flow
     */
    async function initialize() {
        await adapter.connect();
        await Promise.all([
            adapter.once('suspend'),
            plugin.server.sendUpdate(
                AllThreadsStoppedUpdate.fromJson({
                    stopReason: StopReason.Break,
                    stopReasonDetail: 'initial stop',
                    threadIndex: 0
                })
            )
        ]);

        //the stackTrace request first sends a threads request
        plugin.pushResponse(
            ThreadsResponse.fromJson({
                requestId: undefined,
                threads: [{
                    filePath: 'pkg:/source/main.brs',
                    lineNumber: 12,
                    functionName: 'main',
                    isPrimary: true,
                    codeSnippet: '',
                    stopReason: StopReason.Break,
                    stopReasonDetail: 'because'
                }]
            })
        );
        //then it sends the stacktrace request
        plugin.pushResponse(
            StackTraceV3Response.fromJson({
                requestId: undefined,
                entries: [{
                    filePath: 'pkg:/source/main.brs',
                    functionName: 'main',
                    lineNumber: 12
                }]
            })
        );
        //load stack frames
        await adapter.getStackTrace(0);
    }

    describe('getVariable', () => {
        it('works for local vars', async () => {
            await initialize();

            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: undefined,
                    variables: [
                        {
                            isConst: false,
                            isContainer: true,
                            refCount: 1,
                            type: VariableType.AA,
                            value: undefined,
                            childCount: 4,
                            keyType: VariableType.String,
                            name: 'm'
                        },
                        {
                            isConst: false,
                            isContainer: false,
                            refCount: 1,
                            type: VariableType.String,
                            value: '1.0.0',
                            name: 'apiVersion'
                        }
                    ]
                })
            );
            const vars = await adapter.getVariable('', 1);
            expect(
                vars?.children.map(x => x.evaluateName)
            ).to.eql([
                'm',
                'apiVersion'
            ]);
        });

        it.skip('works for object properties', async () => {
            await initialize();

            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: undefined,
                    variables: [
                        {
                            isConst: false,
                            isContainer: true,
                            refCount: 1,
                            type: VariableType.AA,
                            value: undefined,
                            keyType: VariableType.String,
                            children: [{
                                isConst: false,
                                isContainer: false,
                                refCount: 1,
                                type: VariableType.String,
                                name: 'name',
                                value: 'bob'
                            }, {
                                isConst: false,
                                isContainer: false,
                                refCount: 1,
                                type: VariableType.Integer,
                                name: 'age',
                                value: 12
                            }]
                        }
                    ]
                })
            );
            const vars = await adapter.getVariable('person', 0);
            expect(
                vars?.children.map(x => x.evaluateName)
            ).to.eql([
                'person["name"]',
                'person["age"]'
            ]);
        });
    });
});
