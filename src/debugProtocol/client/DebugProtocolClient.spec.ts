/* eslint-disable no-bitwise */
import { DebugProtocolClient } from './DebugProtocolClient';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { Command, ErrorCode, StepType, StopReason } from '../Constants';
import { DebugProtocolServer } from '../server/DebugProtocolServer';
import { defer, util } from '../../util';
import { HandshakeRequest } from '../events/requests/HandshakeRequest';
import { HandshakeResponse } from '../events/responses/HandshakeResponse';
import type { HandshakeV3Response } from '../events/responses/HandshakeV3Response';
import { AllThreadsStoppedUpdate } from '../events/updates/AllThreadsStoppedUpdate';
import type { Variable } from '../events/responses/VariablesResponse';
import { VariablesResponse, VariableType } from '../events/responses/VariablesResponse';
import { VariablesRequest } from '../events/requests/VariablesRequest';
import { DebugProtocolServerTestPlugin } from '../DebugProtocolServerTestPlugin.spec';
import { ContinueRequest } from '../events/requests/ContinueRequest';
import { GenericV3Response } from '../events/responses/GenericV3Response';
import { StopRequest } from '../events/requests/StopRequest';
import { ExitChannelRequest } from '../events/requests/ExitChannelRequest';
import { StepRequest } from '../events/requests/StepRequest';
import type { ThreadInfo } from '../events/responses/ThreadsResponse';
import { ThreadsResponse } from '../events/responses/ThreadsResponse';
import { StackTraceResponse } from '../events/responses/StackTraceResponse';
import { ExecuteRequest } from '../events/requests/ExecuteRequest';
import { ExecuteV3Response } from '../events/responses/ExecuteV3Response';
import { AddBreakpointsResponse } from '../events/responses/AddBreakpointsResponse';
import { AddBreakpointsRequest } from '../events/requests/AddBreakpointsRequest';
import { AddConditionalBreakpointsRequest } from '../events/requests/AddConditionalBreakpointsRequest';
import { AddConditionalBreakpointsResponse } from '../events/responses/AddConditionalBreakpointsResponse';
import { ListBreakpointsRequest } from '../events/requests/ListBreakpointsRequest';
import { ListBreakpointsResponse } from '../events/responses/ListBreakpointsResponse';
import { RemoveBreakpointsResponse } from '../events/responses/RemoveBreakpointsResponse';
import { RemoveBreakpointsRequest } from '../events/requests/RemoveBreakpointsRequest';
import { expectThrows, expectThrowsAsync } from '../../testHelpers.spec';
import { StackTraceV3Response } from '../events/responses/StackTraceV3Response';
import { IOPortOpenedUpdate } from '../events/updates/IOPortOpenedUpdate';
import * as Net from 'net';
import { ThreadAttachedUpdate } from '../events/updates/ThreadAttachedUpdate';
process.on('uncaughtException', (err) => console.log('node js process error\n', err));
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
        client['options'].shutdownTimeout = 100;
        client['options'].exitChannelTimeout = 100;
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
            controlPort: undefined as number,
            host: '127.0.0.1'
        };

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

        try {
            await client?.destroy(true);
        } catch (e) { }
        //shut down and destroy the server after each test
        try {
            await server?.destroy();
        } catch (e) { }
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

    it('sends the pause command', async () => {
        await connect();

        client.isStopped = true;
        await client.pause(); //should do nothing
        expect(plugin.latestRequest).not.to.be.instanceof(StopRequest);

        plugin.pushResponse(GenericV3Response.fromJson({} as any));
        client.isStopped = false;
        await client.pause();
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
        function thread(extra?: Partial<ThreadInfo>) {
            return {
                isPrimary: true,
                stopReason: StopReason.Break,
                stopReasonDetail: 'because',
                lineNumber: 2,
                functionName: 'main',
                filePath: 'pkg:/source/main.brs',
                codeSnippet: 'sub main()',
                ...extra ?? {}
            };
        }

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

        it('ignores the `isPrimary` flag when threadHoppingWorkaround is enabled', async () => {
            await connect();
            client.protocolVersion = '2.0.0';
            client.primaryThread = 0;
            plugin.pushResponse(ThreadsResponse.fromJson({
                requestId: 1,
                threads: [
                    thread({
                        isPrimary: false
                    }),
                    thread({
                        isPrimary: true
                    })
                ]
            }));

            await client.threads();
            expect(client?.primaryThread).to.eql(0);
        });

        it('honors the `isPrimary` flag when threadHoppingWorkaround is disabled', async () => {
            await connect();
            client.protocolVersion = '3.1.0';
            client.primaryThread = 0;
            plugin.pushResponse(ThreadsResponse.fromJson({
                requestId: 1,
                threads: [
                    thread({
                        isPrimary: false
                    }),
                    thread({
                        isPrimary: true
                    })
                ]
            }));

            await client.threads();
            expect(client?.primaryThread).to.eql(1);
        });
    });

    describe('getStackTrace', () => {
        it('skips request if not stopped', async () => {
            await connect();
            client.isStopped = false;

            await client.getStackTrace();
            expect(plugin.latestRequest).not.to.be.instanceof(StackTraceResponse);
        });
    });

    describe('executeCommand', () => {
        it('skips sending command if not stopped', async () => {
            await connect();
            client.isStopped = false;
            await client.executeCommand('code');
            expect(plugin.latestRequest).not.instanceof(ExecuteRequest);
        });

        it('sends command when client is stopped', async () => {
            await connect();

            //the response structure doesn't matter, this test is to verify the request was properly built
            plugin.pushResponse(ExecuteV3Response.fromJson({} as any));

            const response = await client.executeCommand('print 123', 1, 2);
            expect(plugin.getLatestRequest<ExecuteRequest>().data).to.include({
                requestId: plugin.latestRequest.data.requestId,
                stackFrameIndex: 1,
                threadIndex: 2,
                sourceCode: 'print 123'
            });
        });
    });

    describe('addBreakpoints', () => {
        it('returns the proper response', async () => {
            await connect();

            const responseBreakpoins = [{
                errorCode: 0,
                id: 1,
                ignoreCount: 0
            },
            {
                errorCode: 0,
                id: 1,
                ignoreCount: 0
            }];
            plugin.pushResponse(
                AddBreakpointsResponse.fromJson({
                    requestId: 10,
                    breakpoints: responseBreakpoins
                })
            );

            const response = await client.addBreakpoints([{
                filePath: 'pkg:/source/main.brs',
                lineNumber: 10
            }, {
                filePath: 'pkg:/source/lib.brs',
                lineNumber: 15
            }]);
            expect(response.data.breakpoints).to.eql(responseBreakpoins);
        });

        it('sends AddBreakpointsRequest when conditional breakpoints are NOT supported', async () => {
            await connect();
            client.protocolVersion = '2.0.0';

            //response structure doesn't matter, we're verifying that the request was properly built
            plugin.pushResponse(AddBreakpointsResponse.fromJson({} as any));
            await client.addBreakpoints([{
                filePath: 'pkg:/source/main.brs',
                lineNumber: 12,
                conditionalExpression: 'true or true'
            }]);

            expect(plugin.getLatestRequest<AddBreakpointsRequest>()).instanceof(AddBreakpointsRequest);
            expect(plugin.getLatestRequest<AddBreakpointsRequest>().data.breakpoints[0]).not.haveOwnProperty('conditionalExpression');
        });

        it('sends AddConditionalBreakpointsRequest when conditional breakpoints ARE supported', async () => {
            await connect();
            client.protocolVersion = '3.1.0';

            //response structure doesn't matter, we're verifying that the request was properly built
            plugin.pushResponse(AddConditionalBreakpointsResponse.fromJson({} as any));
            await client.addBreakpoints([{
                filePath: 'pkg:/source/main.brs',
                lineNumber: 12,
                conditionalExpression: 'true or true'
            }]);

            expect(plugin.getLatestRequest<AddConditionalBreakpointsRequest>()).instanceof(AddConditionalBreakpointsRequest);
            expect(plugin.getLatestRequest<AddConditionalBreakpointsRequest>().data.breakpoints[0].conditionalExpression).to.eql('true or true');
        });

        it('includes complib prefix when supported', async () => {
            await connect();
            client.protocolVersion = '3.1.0';

            //response structure doesn't matter, we're verifying that the request was properly built
            plugin.pushResponse(AddConditionalBreakpointsResponse.fromJson({} as any));
            await client.addBreakpoints([{
                filePath: 'pkg:/source/main.brs',
                lineNumber: 12,
                componentLibraryName: 'myapp'
            }]);

            expect(plugin.getLatestRequest<AddConditionalBreakpointsRequest>().data.breakpoints[0].filePath).to.eql('lib:/myapp/source/main.brs');
        });

        it('excludes complib prefix when not supported', async () => {
            await connect();
            client.protocolVersion = '2.0.0';

            //response structure doesn't matter, we're verifying that the request was properly built
            plugin.pushResponse(AddConditionalBreakpointsResponse.fromJson({} as any));
            await client.addBreakpoints([{
                filePath: 'pkg:/source/main.brs',
                lineNumber: 12,
                componentLibraryName: 'myapp'
            }]);

            expect(plugin.getLatestRequest<AddConditionalBreakpointsRequest>().data.breakpoints[0].filePath).to.eql('pkg:/source/main.brs');
        });
    });

    describe('listBreakpoints', () => {
        it('sends request when stopped', async () => {
            await connect();
            client.isStopped = true;

            plugin.pushResponse(ListBreakpointsResponse.fromBuffer(null));
            await client.listBreakpoints();
            expect(plugin.latestRequest).instanceof(ListBreakpointsRequest);
        });

        it('sends request when running', async () => {
            await connect();
            client.isStopped = false;

            plugin.pushResponse(ListBreakpointsResponse.fromBuffer(null));
            await client.listBreakpoints();
            expect(plugin.latestRequest).instanceof(ListBreakpointsRequest);
        });
    });

    describe('removeBreakpoints', () => {
        it('sends breakpoint ids', async () => {
            await connect();

            //response structure doesn't matter, we're verifying that the request was properly built
            plugin.pushResponse(RemoveBreakpointsResponse.fromJson({} as any));
            await client.removeBreakpoints([1, 2, 3]);

            expect(plugin.getLatestRequest<RemoveBreakpointsRequest>().data.breakpointIds).to.eql([1, 2, 3]);
        });

        it('skips sending command if no breakpoints were provided', async () => {
            await connect();

            await client.removeBreakpoints(undefined);
            expect(plugin.latestRequest).not.instanceof(RemoveBreakpointsRequest);
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
        expect(plugin.responses[0]?.data).to.eql({
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

    it('discards unrecognized updates', async () => {
        await connect();

        //known update type
        plugin.server['client'].write(
            ThreadAttachedUpdate.fromJson({
                stopReason: StopReason.Break,
                stopReasonDetail: 'before',
                threadIndex: 0
            }).toBuffer()
        );
        //unknown update type

        //known update type
        plugin.server['client'].write(
            ThreadAttachedUpdate.fromJson({
                stopReason: StopReason.Break,
                stopReasonDetail: 'after',
                threadIndex: 1
            }).toBuffer()
        );
        //unk

        // //we should have the two known update types
        // expect(plugin.getRequest(-2)).to.eql();
        // expect(plugin.getRequest(-1)).to.eql();
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

        it('skips sending the request if not stopped', async () => {
            await connect();

            client.isStopped = false;

            await client.getVariables();
            expect(plugin.latestRequest).not.instanceof(VariablesRequest);
        });

        it('returns `uninitialized` for never-defined leftmost variable', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        missingKeyIndex: 0
                    }
                })
            );

            //variable was never defined
            const response = await client.getVariables(['notThere']);
            expect(response.data.variables[0]).to.eql({
                name: 'notThere',
                type: VariableType.Uninitialized,
                value: null,
                childCount: 0,
                isConst: false,
                isContainer: false,
                refCount: 0
            } as Variable);
        });

        it('returns generic response when accessing a property on never-defined variable', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        missingKeyIndex: 0
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'someObj',
                        type: VariableType.Uninitialized,
                        isConst: false,
                        isContainer: true,
                        refCount: 1,
                        value: undefined,
                        childCount: 2,
                        keyType: VariableType.String
                    }]
                })
            );

            //getting prop from variable that was never defined
            await expectThrowsAsync(async () => {
                await client.getVariables(['notThere', 'definitelyNotThere']);
            }, `Cannot read 'definitelyNotThere' on type 'Uninitialized'`);
        });

        it('returns `invalid` when accessing a property on a defined AA', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        missingKeyIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'there',
                        type: VariableType.AssociativeArray,
                        isConst: false,
                        isContainer: true,
                        refCount: 1,
                        value: undefined,
                        childCount: 2,
                        keyType: VariableType.String
                    }]
                })
            );

            //getting prop from variable that was never defined
            const response = await client.getVariables(['there', 'notThere']);
            expect(response.data.variables[0]).to.eql({
                name: 'notThere',
                type: VariableType.Invalid,
                value: 'Invalid (not defined)',
                childCount: 0,
                isConst: false,
                isContainer: false,
                refCount: 0
            } as Variable);
        });

        it('returns generic response when accessing a property on a property that does not exist', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        missingKeyIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'notThere',
                        type: VariableType.Invalid,
                        isConst: false,
                        isContainer: false,
                        refCount: 1,
                        value: undefined
                    }]
                })
            );

            //getting prop from variable that was assigned to invalid (i.e. `setToInvalid = invalid`)
            await expectThrowsAsync(async () => {
                await client.getVariables(['there', 'notThere', 'definitelyNotThere']);
            }, `Cannot read 'notThere' on type 'Invalid'`);

            //make sure we requested the correct variable
            expect(plugin.getRequest<VariablesRequest>(-1).data.variablePathEntries.map(x => x.name)).to.eql(['there']);
        });

        it('returns generic response when accessing a property on a property that does not exist in the middle', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        missingKeyIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'notThere',
                        type: VariableType.Invalid,
                        isConst: false,
                        isContainer: false,
                        refCount: 1,
                        value: undefined
                    }]
                })
            );
            //getting prop from variable that was assigned to invalid (i.e. `setToInvalid = invalid`)
            await expectThrowsAsync(async () => {
                await client.getVariables(['there', 'notThere', 'definitelyNotThere', 'reallyNotThere']);
            }, `Cannot read 'notThere' on type 'Invalid'`);

            //make sure we requested the correct variable
            expect(plugin.getRequest<VariablesRequest>(-1).data.variablePathEntries.map(x => x.name)).to.eql(['there']);
        });

        it('shows node and subtype for failed prop access', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        missingKeyIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'notThere',
                        type: VariableType.SubtypedObject,
                        isConst: false,
                        isContainer: false,
                        refCount: 1,
                        value: 'roSGNode; Node'
                    }]
                })
            );
            //getting prop from variable that was assigned to invalid (i.e. `setToInvalid = invalid`)
            await expectThrowsAsync(async () => {
                await client.getVariables(['there', 'notThere', 'definitelyNotThere', 'reallyNotThere']);
            }, `Cannot read 'notThere' on type 'roSGNode (Node)'`);

            //make sure we requested the correct variable
            expect(plugin.getRequest<VariablesRequest>(-1).data.variablePathEntries.map(x => x.name)).to.eql(['there']);
        });

        it('returns faked variable response with invalid', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        invalidPathIndex: 0
                    }
                })
            );

            //getting prop from variable that was assigned to invalid (i.e. `setToInvalid = invalid`)
            const response = await client.getVariables(['notThere']);
            expect(response?.data?.variables?.[0]?.type).to.eql(VariableType.Invalid);
        });

        it('throws when reading prop on invalid', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        invalidPathIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'there',
                        type: VariableType.Invalid,
                        isConst: false,
                        isContainer: false,
                        refCount: 1,
                        value: 'Invalid'
                    }]
                })
            );
            //getting prop from variable that was assigned to invalid (i.e. `setToInvalid = invalid`)
            await expectThrowsAsync(async () => {
                await client.getVariables(['there', 'setToInvalid', 'notThere']);
            }, `Cannot read 'notThere' on type 'Invalid'`);

            //make sure we requested the correct variable
            expect(plugin.getRequest<VariablesRequest>(-1).data.variablePathEntries.map(x => x.name)).to.eql(['there', 'setToInvalid']);
        });

        it('returns invalid when left-hand item is an AA but right-hand item is missing', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        invalidPathIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'there',
                        type: VariableType.Invalid,
                        isConst: false,
                        isContainer: false,
                        refCount: 1,
                        value: 'Invalid'
                    }]
                })
            );
            //getting prop from variable that was assigned to invalid (i.e. `setToInvalid = invalid`)
            await expectThrowsAsync(async () => {
                await client.getVariables(['there', 'setToInvalid', 'notThere']);
            }, `Cannot read 'notThere' on type 'Invalid'`);

            //make sure we requested the correct variable
            expect(plugin.getRequest<VariablesRequest>(-1).data.variablePathEntries.map(x => x.name)).to.eql(['there', 'setToInvalid']);
        });

        it('returns generic response when accessing a property on a variable with the value of `invalid`', async () => {
            await connect();

            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        invalidPathIndex: 0
                    }
                })
            );

            await expectThrowsAsync(async () => {
                await client.getVariables(['setToInvalid', 'notThere']);
            }, `Cannot read 'notThere'`);
        });

        it('returns generic response when accessing a property on a property with the value of `invalid`', async () => {
            await connect();

            //the initial response
            plugin.pushResponse(
                GenericV3Response.fromJson({
                    errorCode: ErrorCode.INVALID_ARGS,
                    requestId: 1,
                    errorData: {
                        invalidPathIndex: 1
                    }
                })
            );

            //another response for the "go one level up to get type info" request
            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: 1,
                    variables: [{
                        name: 'somePropWithValueSetToInvalid',
                        type: VariableType.Invalid,
                        isConst: false,
                        isContainer: false,
                        refCount: 1,
                        value: undefined
                    }]
                })
            );

            //getting prop from variable that was never defined
            await expectThrowsAsync(async () => {
                await client.getVariables(['someObj', 'somePropWithValueSetToInvalid', 'notThere']);
            }, `Cannot read 'notThere' on type 'Invalid'`);
        });

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

    describe('sendRequest', () => {
        it('throws when controller is missing', async () => {
            await connect();

            delete client['controlSocket'];
            await expectThrowsAsync(async () => {
                await client.listBreakpoints();
            }, 'Control socket was closed - Command: ListBreakpoints');
        });

        it('resolves only for matching requestId', async () => {
            await connect();

            plugin.pushResponse(ListBreakpointsResponse.fromJson({
                requestId: 10,
                breakpoints: [{
                    id: 123,
                    errorCode: 0,
                    ignoreCount: 2
                }]
            }));
            plugin.pushResponse(StackTraceV3Response.fromJson({
                requestId: 12,
                entries: []
            }));

            //run both requests in quick succession so they both are listening to both responses
            const [listBreakpointsResponse, getStackTraceResponse] = await Promise.all([
                client.listBreakpoints(),
                client.getStackTrace()
            ]);
            expect(listBreakpointsResponse?.data.breakpoints[0]).to.include({
                id: 123,
                errorCode: 0,
                ignoreCount: 2
            });
            expect(getStackTraceResponse.data.entries).to.eql([]);
        });

        it('recovers on incomplete buffer', async () => {
            await connect();

            const buffer = AllThreadsStoppedUpdate.fromJson({
                stopReason: StopReason.Break,
                stopReasonDetail: 'because',
                threadIndex: 0
            }).toBuffer();

            const dataReceivedPromise = client.once('data');
            const promise = client.once<AllThreadsStoppedUpdate>('suspend');

            //write half the buffer
            plugin.server['client'].write(buffer.slice(0, 5));
            //wait until we receive that data
            await dataReceivedPromise;
            //write the rest of the buffer
            plugin.server['client'].write(buffer.slice(5));

            //wait until the update shows up
            const update = await promise;
            expect(update.data.stopReasonDetail).to.eql('because');
        });
    });

    describe('connectToIoPort', () => {
        let ioServer: Net.Server;
        let port: number;
        let ioClient: Net.Socket;
        let socketPromise: Promise<Net.Socket>;

        beforeEach(async () => {
            port = await util.getPort();
            ioServer = new Net.Server();
            const deferred = defer<Net.Socket>();
            socketPromise = deferred.promise;
            ioServer.listen({
                port: port,
                hostName: '0.0.0.0'
            }, () => { });
            ioServer.on('connection', (socket) => {
                ioClient = socket;
                ioClient.on('error', e => console.error(e));
                deferred.resolve(ioClient);
            });
            ioServer.on('error', e => console.error(e));
        });

        afterEach(() => {
            try {
                ioServer?.close();
            } catch { }
            try {
                ioClient?.destroy();
            } catch { }
        });

        it('supports the IOPortOpened update', async () => {
            await connect();

            const ioOutputPromise = client.once('io-output');

            await plugin.server.sendUpdate(IOPortOpenedUpdate.fromJson({
                port: port
            }));

            const socket = await socketPromise;
            socket.write('hello\nworld\n');

            const output = await ioOutputPromise;
            expect(output).to.eql('hello\nworld');
        });

        it('handles partial lines', async () => {
            await connect();

            await plugin.server.sendUpdate(IOPortOpenedUpdate.fromJson({
                port: port
            }));

            const socket = await socketPromise;
            const outputMonitors = [
                defer(),
                defer(),
                defer()
            ];
            const output = [];

            const outputPromise = client.once('io-output');

            client['ioSocket'].on('data', (data) => {
                outputMonitors[output.length].resolve();
                output.push(data.toString());
            });

            socket.write('hello ');
            await outputMonitors[0].promise;
            socket.write('world\n');
            await outputMonitors[1].promise;
            expect(await outputPromise).to.eql('hello world');
        });

        it('handles failed update', async () => {
            await connect();
            const update = IOPortOpenedUpdate.fromJson({
                port: port
            });
            update.success = false;
            expect(
                client['connectToIoPort'](update)
            ).to.be.false;
        });

        it('terminates the ioClient on "end"', async () => {
            await connect();
            await plugin.server.sendUpdate(IOPortOpenedUpdate.fromJson({
                port: port
            }));
            await socketPromise;
            ioServer.close();
        });
    });

    it('handles ThreadAttachedUpdate type', async () => {
        await connect();

        const promise = client.once('suspend');
        client.primaryThread = 1;
        await plugin.server.sendUpdate(ThreadAttachedUpdate.fromJson({
            stopReason: StopReason.Break,
            stopReasonDetail: 'because',
            threadIndex: 2
        }));
        await promise;
        expect(client.primaryThread).to.eql(2);
    });
});
