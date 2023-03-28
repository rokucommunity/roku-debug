/* eslint-disable prefer-arrow-callback */

import { expect } from 'chai';
import type { DebugProtocolClient } from '../debugProtocol/client/DebugProtocolClient';
import { DebugProtocolAdapter, KeyType } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import { VariableType, VariablesResponse } from '../debugProtocol/events/responses/VariablesResponse';
import { DebugProtocolServer } from '../debugProtocol/server/DebugProtocolServer';
import { defer, util } from '../util';
import { standardizePath as s } from 'brighterscript';
import { DebugProtocolServerTestPlugin } from '../debugProtocol/DebugProtocolServerTestPlugin.spec';
import { AllThreadsStoppedUpdate } from '../debugProtocol/events/updates/AllThreadsStoppedUpdate';
import { ErrorCode, StopReason } from '../debugProtocol/Constants';
import { ThreadsResponse } from '../debugProtocol/events/responses/ThreadsResponse';
import { StackTraceV3Response } from '../debugProtocol/events/responses/StackTraceV3Response';
import { AddBreakpointsResponse } from '../debugProtocol/events/responses/AddBreakpointsResponse';
import { BreakpointManager } from '../managers/BreakpointManager';
import { SourceMapManager } from '../managers/SourceMapManager';
import { LocationManager } from '../managers/LocationManager';
import { Project, ProjectManager } from '../managers/ProjectManager';
import { AddBreakpointsRequest } from '../debugProtocol/events/requests/AddBreakpointsRequest';
import { AddConditionalBreakpointsRequest } from '../debugProtocol/events/requests/AddConditionalBreakpointsRequest';
import { AddConditionalBreakpointsResponse } from '../debugProtocol/events/responses/AddConditionalBreakpointsResponse';
import { RemoveBreakpointsResponse } from '../debugProtocol/events/responses/RemoveBreakpointsResponse';
import { BreakpointVerifiedUpdate } from '../debugProtocol/events/updates/BreakpointVerifiedUpdate';
import { RemoveBreakpointsRequest } from '../debugProtocol/events/requests/RemoveBreakpointsRequest';
import type { AfterSendRequestEvent } from '../debugProtocol/client/DebugProtocolClientPlugin';
import { GenericV3Response } from '../debugProtocol/events/responses/GenericV3Response';
const sinon = createSandbox();

let cwd = s`${process.cwd()}`;
let tmpDir = s`${cwd}/.tmp`;
let rootDir = s`${tmpDir}/rootDir`;
const outDir = s`${tmpDir}/out`;
/**
 * A path to main.brs
 */
const srcPath = `${rootDir}/source/main.brs`;

describe('DebugProtocolAdapter', function() {
    //allow these tests to run for longer since there's more IO overhead due to the socket logic
    this.timeout(3000);
    let adapter: DebugProtocolAdapter;
    let server: DebugProtocolServer;
    let client: DebugProtocolClient;
    let plugin: DebugProtocolServerTestPlugin;
    let breakpointManager: BreakpointManager;
    let projectManager: ProjectManager;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        const options = {
            controlPort: undefined as number,
            host: '127.0.0.1'
        };
        const sourcemapManager = new SourceMapManager();
        const locationManager = new LocationManager(sourcemapManager);
        breakpointManager = new BreakpointManager(sourcemapManager, locationManager);
        projectManager = new ProjectManager(breakpointManager, locationManager);
        projectManager.mainProject = new Project({
            rootDir: rootDir,
            files: [],
            outDir: outDir
        });
        adapter = new DebugProtocolAdapter(options, projectManager, breakpointManager);

        if (!options.controlPort) {
            options.controlPort = await util.getPort();
        }
        server = new DebugProtocolServer(options);
        plugin = server.plugins.add(new DebugProtocolServerTestPlugin());
        await server.start();
    });

    afterEach(async () => {
        sinon.restore();
        client?.destroy(true);
        //shut down and destroy the server after each test
        await server?.stop();
        await util.sleep(10);
    });

    /**
     * Handles the initial connection and the "stop at first byte code" flow
     */
    async function initialize() {
        await adapter.connect();
        client = adapter['socketDebugger'];
        client['options'].shutdownTimeout = 100;
        client['options'].exitChannelTimeout = 100;
        //disable logging for tests because they clutter the test output
        client['logger'].logLevel = 'off';
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

    describe('getStackTrace', () => {
        it('recovers when there are no stack frames', async () => {
            await initialize();
            //should not throw exception
            expect(
                await adapter.getStackTrace(-1)
            ).to.eql([]);
        });
    });

    describe('syncBreakpoints', () => {

        it('resurrects breakpoints when the entire delete request failed', async () => {
            await initialize();
            //disable auto breakpoint verification
            client.protocolVersion = '3.2.0';

            //add initial breakpoints
            const [bp1, bp2, bp3] = breakpointManager.replaceBreakpoints(srcPath, [
                { line: 1 },
                { line: 2 },
                { line: 3 }
            ]);

            plugin.pushResponse(AddBreakpointsResponse.fromJson({
                breakpoints: [
                    { id: 1, errorCode: ErrorCode.OK, ignoreCount: 0 },
                    { id: 2, errorCode: ErrorCode.OK, ignoreCount: 0 },
                    { id: 3, errorCode: ErrorCode.OK, ignoreCount: 0 }
                ],
                requestId: 1
            }));

            await adapter.syncBreakpoints();

            //delete some breakpoints
            breakpointManager.deleteBreakpoints([bp1, bp3]);

            //causes complete error
            plugin.pushResponse(GenericV3Response.fromJson({
                errorCode: ErrorCode.INVALID_ARGS,
                requestId: 1
            }));

            const resurrectedPromise = breakpointManager.once('breakpoints-resurrected');

            //sync the breakpoints. this request will fail, so the breakpoints should become resurrected
            await adapter.syncBreakpoints();

            expect(
                await resurrectedPromise
            ).to.eql({ breakpoints: [bp1, bp3] });
        });

        it('resurrects breakpoints when specific breakpoints failed to delete', async () => {
            await initialize();
            //disable auto breakpoint verification
            client.protocolVersion = '3.2.0';

            //add initial breakpoints
            const [bp1, bp2, bp3] = breakpointManager.replaceBreakpoints(srcPath, [
                { line: 1 },
                { line: 2 },
                { line: 3 }
            ]);

            plugin.pushResponse(AddBreakpointsResponse.fromJson({
                breakpoints: [
                    { id: 1, errorCode: ErrorCode.OK, ignoreCount: 0 },
                    { id: 2, errorCode: ErrorCode.OK, ignoreCount: 0 },
                    { id: 3, errorCode: ErrorCode.OK, ignoreCount: 0 }
                ],
                requestId: 1
            }));

            await adapter.syncBreakpoints();

            //delete some breakpoints
            breakpointManager.deleteBreakpoints([bp1, bp3]);

            //causes complete error
            plugin.pushResponse(RemoveBreakpointsResponse.fromJson({
                breakpoints: [
                    { errorCode: ErrorCode.INVALID_ARGS, id: bp1.deviceId, ignoreCount: 0 }
                ],
                requestId: 1
            }));

            const resurrectedPromise = breakpointManager.once('breakpoints-resurrected');

            //sync the breakpoints. this request will succeed but one of the breakpoints was bad, so that one should become resurrected
            await adapter.syncBreakpoints();

            expect(
                await resurrectedPromise
            ).to.eql({ breakpoints: [bp1] });
        });

        it('removes any newly-added breakpoints that have errors', async () => {
            await initialize();

            const [bp1, bp2] = breakpointManager.replaceBreakpoints(srcPath, [
                { line: 1 },
                { line: 2 }
            ]);

            plugin.pushResponse(AddBreakpointsResponse.fromJson({
                breakpoints: [{
                    id: 3,
                    errorCode: ErrorCode.OK,
                    ignoreCount: 0
                }, {
                    id: 4,
                    errorCode: ErrorCode.INVALID_ARGS,
                    ignoreCount: 0
                }],
                requestId: 1
            }));

            //sync breakpoints
            await adapter.syncBreakpoints();

            //the bad breakpoint (id=2) should now be removed
            expect(breakpointManager.getBreakpoints([bp1, bp2])).to.eql([bp1]);
        });

        it('only allows one to run at a time', async () => {
            let concurrentCount = 0;
            let maxConcurrentCount = 0;

            sinon.stub(adapter, '_syncBreakpoints').callsFake(async () => {
                console.log('_syncBreakpoints');
                concurrentCount++;
                maxConcurrentCount = Math.max(0, concurrentCount);
                //several nextticks here to give other promises a chance to run
                await util.sleep(0);
                maxConcurrentCount = Math.max(0, concurrentCount);
                await util.sleep(0);
                maxConcurrentCount = Math.max(0, concurrentCount);
                await util.sleep(0);
                maxConcurrentCount = Math.max(0, concurrentCount);
                await util.sleep(0);
                maxConcurrentCount = Math.max(0, concurrentCount);
                concurrentCount--;
            });

            await Promise.all([
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints(),
                adapter.syncBreakpoints()
            ]);
            expect(maxConcurrentCount).to.eql(1);
        });

        it('removes "added" breakpoints that show up after a breakpoint was already removed', async () => {
            const bpId = 123;
            const bpLine = 12;
            await initialize();

            //force the client to expect the device to verify breakpoints (instead of auto-verifying them as soon as seen)
            client.protocolVersion = '3.2.0';

            breakpointManager.setBreakpoint(srcPath, {
                line: bpLine
            });

            let bpResponseDeferred = defer();

            //once the breakpoint arrives at the server
            let bpAtServerPromise = new Promise<void>((resolve) => {
                let handled = false;
                const tempPlugin = server.plugins.add({
                    provideResponse: (event) => {
                        if (!handled && event.request instanceof AddBreakpointsRequest) {
                            handled = true;
                            //resolve the outer promise
                            resolve();
                            //return a deferred promise for us to flush later
                            return bpResponseDeferred.promise;
                        }
                    }
                });
            });

            plugin.pushResponse(
                AddBreakpointsResponse.fromJson({
                    requestId: 1,
                    breakpoints: [{
                        id: bpId,
                        errorCode: ErrorCode.OK,
                        ignoreCount: 0
                    }]
                })
            );
            //sync the breakpoints to mark this one as "sent to device"
            void adapter.syncBreakpoints();
            //wait for the request to arrive at the server (it will be stuck pending until we resolve the bpResponseDeferred)
            await bpAtServerPromise;

            //delete the breakpoint (before we ever got the deviceId from the server)
            breakpointManager.replaceBreakpoints(srcPath, []);

            //run another breakpoint diff to simulate the breakpoint being deleted before the device responded with the device IDs
            await breakpointManager.getDiff(projectManager.getAllProjects());

            //sync the breakpoints again, forcing the bp to be fully deleted
            let syncPromise = adapter.syncBreakpoints();
            //since the breakpoints were deleted before getting deviceIDs, there should be no request sent
            bpResponseDeferred.resolve();
            //wait for the second sync to finish
            await syncPromise;

            //response for the "remove breakpoints" request triggered later
            plugin.pushResponse(
                RemoveBreakpointsResponse.fromJson({
                    requestId: 1,
                    breakpoints: [{
                        id: bpId,
                        errorCode: ErrorCode.OK,
                        ignoreCount: 0
                    }]
                })
            );

            //listen for the next sent RemoveBreakpointsRequest
            const sentRequestPromise = client.plugins.onceIf<AfterSendRequestEvent<RemoveBreakpointsRequest>>('afterSendRequest', (event) => {
                return event.request instanceof RemoveBreakpointsRequest;
            }, 0);

            //now push the "bp verified" event
            //the client should recognize that these breakpoints aren't avaiable client-side, and ask the server to delete them
            await server.sendUpdate(
                BreakpointVerifiedUpdate.fromJson({
                    breakpoints: [{
                        id: bpId
                    }]
                })
            );

            //wait for the request to be sent
            expect(
                (await sentRequestPromise).request?.data.breakpointIds
            ).to.eql([bpId]);
        });

        it('excludes non-numeric breakpoint IDs', async () => {
            await initialize();

            const breakpoint = adapter['breakpointManager'].setBreakpoint(`${rootDir}/source/main.brs`, {
                line: 12
            });
            plugin.pushResponse(
                AddBreakpointsResponse.fromJson({
                    breakpoints: [{ id: 10 } as any],
                    requestId: 1
                })
            );
            //sync the breakpoints to mark this one as "sent to device"
            await adapter.syncBreakpoints();

            // //replace the breakpoints before they were verified
            // adapter['breakpointManager'].replaceBreakpoints(`${rootDir}/source/main.brs`, []);
            // breakpoint.deviceId = undefined;

            // //sync the breakpoints again. Since the breakpoint doesn't have an ID, we shouldn't send any request
            // await adapter.syncBreakpoints();

            // expect(plugin.latestRequest?.constructor.name).not.to.eql(RemoveBreakpointsResponse.name);
        });

        it('skips sending AddBreakpoints and AddConditionalBreakpoints command when there are no breakpoints', async () => {
            await initialize();

            await adapter.syncBreakpoints();
            const reqs = [
                plugin.getRequest(-2)?.constructor.name,
                plugin.getRequest(-1)?.constructor.name
            ];
            expect(reqs).not.to.include(AddBreakpointsRequest.name);
            expect(reqs).not.to.include(AddConditionalBreakpointsRequest.name);
        });

        it('skips sending AddConditionalBreakpoints command when there were only standard breakpoints', async () => {
            await initialize();

            adapter['breakpointManager'].setBreakpoint(`${rootDir}/source/main.brs`, {
                line: 12
            });

            //let the "add" request go through
            plugin.pushResponse(
                AddConditionalBreakpointsResponse.fromJson({
                    breakpoints: [],
                    requestId: 1
                })
            );
            await adapter.syncBreakpoints();
            const reqs = [
                plugin.getRequest(-2)?.constructor.name,
                plugin.getRequest(-1)?.constructor.name
            ];
            expect(reqs).to.include(AddBreakpointsRequest.name);
            expect(reqs).not.to.include(AddConditionalBreakpointsRequest.name);
        });

        it('skips sending AddBreakpoints command when there only conditional breakpoints', async () => {
            await initialize();

            adapter['breakpointManager'].setBreakpoint(`${rootDir}/source/main.brs`, {
                line: 12,
                condition: 'true'
            });

            //let the "add" request go through
            plugin.pushResponse(
                AddBreakpointsResponse.fromJson({
                    breakpoints: [],
                    requestId: 1
                })
            );
            await adapter.syncBreakpoints();
            const reqs = [
                plugin.getRequest(-2)?.constructor.name,
                plugin.getRequest(-1)?.constructor.name
            ];
            expect(reqs).not.to.include(AddBreakpointsRequest.name);
            expect(reqs).to.include(AddConditionalBreakpointsRequest.name);
        });
    });

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
                            type: VariableType.AssociativeArray,
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
            const vars = await adapter.getLocalVariables(1);
            expect(
                vars?.children.map(x => x.evaluateName)
            ).to.eql([
                'm',
                'apiVersion'
            ]);
        });

        it('works for object properties', async () => {
            await initialize();

            //load the stack trace which is required for variable requests to work
            const frames = await adapter.getStackTrace(0);
            const frameId = frames[0].frameId;

            plugin.pushResponse(
                VariablesResponse.fromJson({
                    requestId: undefined,
                    variables: [
                        {
                            isConst: false,
                            isContainer: true,
                            refCount: 1,
                            type: VariableType.AssociativeArray,
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
            const container = await adapter.getVariable('person', frameId);
            expect(
                container?.children.map(x => x.evaluateName)
            ).to.eql([
                'person["name"]',
                'person["age"]'
            ]);
            //the top level object should be an AA
            expect(container.type).to.eql(VariableType.AssociativeArray);
            expect(container.keyType).to.eql(KeyType.string);
            expect(container.elementCount).to.eql(2);

            //the children should NOT look like objects
            expect(container.children[0].keyType).not.to.exist;
            expect(container.children[0].elementCount).not.to.exist;
            expect(container.children[0].children).to.eql([]);

            expect(container.children[1].keyType).not.to.exist;
            expect(container.children[1].elementCount).not.to.exist;
            expect(container.children[1].children).to.eql([]);
        });
    });
});
