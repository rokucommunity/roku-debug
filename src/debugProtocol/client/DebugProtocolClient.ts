import * as Net from 'net';
import * as EventEmitter from 'eventemitter3';
import * as semver from 'semver';
import { PROTOCOL_ERROR_CODES, Command, StepType, StopReasonCode, ErrorCode, UpdateType, UpdateTypeCode, StopReason } from '../Constants';
import { logger } from '../../logging';
import { ExecuteV3Response } from '../events/responses/ExecuteV3Response';
import { ListBreakpointsResponse } from '../events/responses/ListBreakpointsResponse';
import { AddBreakpointsResponse } from '../events/responses/AddBreakpointsResponse';
import { RemoveBreakpointsResponse } from '../events/responses/RemoveBreakpointsResponse';
import { util } from '../../util';
import { BreakpointErrorUpdate } from '../events/updates/BreakpointErrorUpdate';
import { ContinueRequest } from '../events/requests/ContinueRequest';
import { StopRequest } from '../events/requests/StopRequest';
import { ExitChannelRequest } from '../events/requests/ExitChannelRequest';
import { StepRequest } from '../events/requests/StepRequest';
import { RemoveBreakpointsRequest } from '../events/requests/RemoveBreakpointsRequest';
import { ListBreakpointsRequest } from '../events/requests/ListBreakpointsRequest';
import { VariablesRequest } from '../events/requests/VariablesRequest';
import { StackTraceRequest } from '../events/requests/StackTraceRequest';
import { ThreadsRequest } from '../events/requests/ThreadsRequest';
import { ExecuteRequest } from '../events/requests/ExecuteRequest';
import { AddBreakpointsRequest } from '../events/requests/AddBreakpointsRequest';
import { AddConditionalBreakpointsRequest } from '../events/requests/AddConditionalBreakpointsRequest';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from '../events/ProtocolEvent';
import { HandshakeResponse } from '../events/responses/HandshakeResponse';
import { HandshakeV3Response } from '../events/responses/HandshakeV3Response';
import { HandshakeRequest } from '../events/requests/HandshakeRequest';
import { GenericV3Response } from '../events/responses/GenericV3Response';
import { AllThreadsStoppedUpdate } from '../events/updates/AllThreadsStoppedUpdate';
import { CompileErrorUpdate } from '../events/updates/CompileErrorUpdate';
import { GenericResponse } from '../events/responses/GenericResponse';
import { StackTraceResponse } from '../events/responses/StackTraceResponse';
import { ThreadsResponse } from '../events/responses/ThreadsResponse';
import { VariablesResponse } from '../events/responses/VariablesResponse';
import { IOPortOpenedUpdate } from '../events/updates/IOPortOpenedUpdate';
import { ThreadAttachedUpdate } from '../events/updates/ThreadAttachedUpdate';
import { StackTraceV3Response } from '../events/responses/StackTraceV3Response';

export class DebugProtocolClient {

    private logger = logger.createLogger(`[${DebugProtocolClient.name}]`);

    // The highest tested version of the protocol we support.
    public supportedVersionRange = '<=3.0.0';

    constructor(
        options: ConstructorOptions
    ) {
        this.options = {
            controllerPort: 8081,
            host: undefined,
            //override the defaults with the options from parameters
            ...options ?? {}
        };
    }
    public static DEBUGGER_MAGIC = 'bsdebug'; // 64-bit = [b'bsdebug\0' little-endian]

    public scriptTitle: string;
    public isHandshakeComplete = false;
    public connectedToIoPort = false;
    /**
     * Debug protocol version 3.0.0 introduced a packet_length to all responses. Prior to that, most responses had no packet length at all.
     * This field indicates whether we should be looking for packet_length or not in the responses we get from the device
     */
    public watchPacketLength = false;
    public protocolVersion: string;
    public primaryThread: number;
    public stackFrameIndex: number;

    private emitter = new EventEmitter();
    private controllerClient: Net.Socket;
    private ioClient: Net.Socket;
    private buffer = Buffer.alloc(0);
    /**
     * Is the debugger currently stopped at a line of code in the program
     */
    public isStopped = false;
    private requestIdSequence = 1;
    private activeRequests = new Map<number, ProtocolRequest>();
    private options: ConstructorOptions;

    /**
     * Prior to protocol v3.1.0, the Roku device would regularly set the wrong thread as "active",
     * so this flag lets us know if we should use our better-than-nothing workaround
     */
    private get enableThreadHoppingWorkaround() {
        return semver.satisfies(this.protocolVersion, '<3.1.0');
    }

    /**
     * Starting in protocol v3.1.0, component libary breakpoints must be added in the format `lib:/<library_name>/<filepath>`, but prior they didn't require this.
     * So this flag tells us which format to support
     */
    private get enableComponentLibrarySpecificBreakpoints() {
        return semver.satisfies(this.protocolVersion, '>=3.1.0');
    }

    /**
     * Starting in protocol v3.1.0, breakpoints can support conditional expressions. This flag indicates whether the current sessuion supports that functionality.
     */
    private get supportsConditionalBreakpoints() {
        return semver.satisfies(this.protocolVersion, '>=3.1.0');
    }

    /**
     * Get a promise that resolves after an event occurs exactly once
     */
    public once(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start'): Promise<void>;
    public once(eventName: 'runtime-error' | 'suspend'): Promise<AllThreadsStoppedUpdate | ThreadAttachedUpdate>;
    public once(eventName: 'io-output'): Promise<string>;
    public once(eventName: 'protocol-version'): Promise<ProtocolVersionDetails>;
    public once(eventName: 'handshake-verified'): Promise<HandshakeResponse>;
    public once(eventName: string) {
        return new Promise((resolve) => {
            const disconnect = this.on(eventName as Parameters<DebugProtocolClient['on']>[0], (...args) => {
                disconnect();
                resolve(...args);
            });
        });
    }

    public on(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start', handler: () => void);
    public on(eventName: 'response', handler: (update: ProtocolResponse) => void);
    public on(eventName: 'update', handler: (update: ProtocolUpdate) => void);
    public on(eventName: 'runtime-error' | 'suspend', handler: (data: AllThreadsStoppedUpdate | ThreadAttachedUpdate) => void);
    public on(eventName: 'io-output', handler: (output: string) => void);
    public on(eventName: 'protocol-version', handler: (data: ProtocolVersionDetails) => void);
    public on(eventName: 'handshake-verified', handler: (data: HandshakeResponse) => void);
    // public on(eventname: 'rendezvous', handler: (output: RendezvousHistory) => void);
    // public on(eventName: 'runtime-error', handler: (error: BrightScriptRuntimeError) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.removeListener(eventName, handler);
        };
    }

    private emit(eventName: 'response', response: ProtocolResponse);
    private emit(eventName: 'update', update: ProtocolUpdate);
    private emit(eventName: 'suspend' | 'runtime-error', data: AllThreadsStoppedUpdate | ThreadAttachedUpdate);
    private emit(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'handshake-verified' | 'io-output' | 'protocol-version' | 'start', data?);
    private emit(eventName: string, data?) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            this.emitter.emit(eventName, data);
        }, 0);
    }

    private async establishControllerConnection() {
        const pendingSockets = new Set<Net.Socket>();
        const connection = await new Promise<Net.Socket>((resolve) => {
            util.setInterval((cancelInterval) => {
                const socket = new Net.Socket();
                pendingSockets.add(socket);
                socket.on('error', (error) => {
                    console.debug(Date.now(), 'Encountered an error connecting to the debug protocol socket. Ignoring and will try again soon', error);
                });
                socket.connect({ port: this.options.controllerPort, host: this.options.host }, () => {
                    cancelInterval();

                    this.logger.debug(`Connected to debug protocol controller port. Socket ${[...pendingSockets].indexOf(socket)} of ${pendingSockets.size} was the winner`);
                    //clean up all remaining pending sockets
                    for (const pendingSocket of pendingSockets) {
                        pendingSocket.removeAllListeners();
                        //cleanup and destroy all other sockets
                        if (pendingSocket !== socket) {
                            pendingSocket.end();
                            pendingSocket?.destroy();
                        }
                    }
                    pendingSockets.clear();
                    resolve(socket);
                });
            }, this.options.controllerConnectInterval ?? 250);
        });
        return connection;
    }

    public async connect(): Promise<boolean> {
        this.logger.log('connect', this.options);

        // If there is no error, the server has accepted the request and created a new dedicated control socket
        this.controllerClient = await this.establishControllerConnection();

        this.controllerClient.on('data', (data) => {
            this.buffer = Buffer.concat([this.buffer, data]);

            this.logger.debug(`on('data'): incoming bytes`, data.length);
            const startBufferSize = this.buffer.length;

            this.process();

            const endBufferSize = this.buffer?.length ?? 0;
            this.logger.debug(`buffer size before:`, startBufferSize, ', buffer size after:', endBufferSize, ', bytes consumed:', startBufferSize - endBufferSize);
        });

        this.controllerClient.on('end', () => {
            this.logger.log('TCP connection closed');
            this.shutdown('app-exit');
        });

        // Don't forget to catch error, for your own sake.
        this.controllerClient.once('error', (error) => {
            //the Roku closed the connection for some unknown reason...
            console.error(`TCP connection error on control port`, error);
            this.shutdown('close');
        });

        //subscribe to all unsolicited updates
        this.on('update', (update) => {
            this.handleUpdate(update);
        });

        //send the magic, which triggers the debug session
        this.logger.log('Sending magic to server');

        //send the handshake request, and wait for the handshake response from the device
        const response = await this.sendRequest<HandshakeV3Response | HandshakeResponse>(
            HandshakeRequest.fromJson({
                magic: DebugProtocolClient.DEBUGGER_MAGIC
            })
        );

        this.verifyHandshake(response);
        this.isHandshakeComplete = true;
        return response.success;
    }

    public async continue() {
        if (this.isStopped) {
            this.isStopped = false;
            return this.sendRequest<GenericResponse>(
                ContinueRequest.fromJson({
                    requestId: this.requestIdSequence++
                })
            );
        }
    }

    public async pause(force = false) {
        if (this.isStopped === false || force) {
            return this.sendRequest<GenericResponse>(
                StopRequest.fromJson({
                    requestId: this.requestIdSequence++
                })
            );
        }
    }

    public async exitChannel() {
        return this.sendRequest<GenericResponse>(
            ExitChannelRequest.fromJson({
                requestId: this.requestIdSequence++
            })
        );
    }

    public async stepIn(threadIndex: number = this.primaryThread) {
        return this.step(StepType.Line, threadIndex);
    }

    public async stepOver(threadIndex: number = this.primaryThread) {
        return this.step(StepType.Over, threadIndex);
    }

    public async stepOut(threadIndex: number = this.primaryThread) {
        return this.step(StepType.Out, threadIndex);
    }

    private async step(stepType: StepType, threadIndex: number): Promise<GenericResponse> {
        this.logger.log('[step]', { stepType: stepType, threadId: threadIndex, stopped: this.isStopped });

        if (this.isStopped) {
            this.isStopped = false;
            let stepResult = await this.sendRequest<GenericResponse>(
                StepRequest.fromJson({
                    requestId: this.requestIdSequence++,
                    stepType: stepType,
                    threadIndex: threadIndex
                })
            );
            if (stepResult.data.errorCode === ErrorCode.OK) {
                this.isStopped = true;
                //TODO this is not correct. Do we get a new threads event after a step? Perhaps that should be what triggers the event instead of us?
                this.emit('suspend', stepResult as AllThreadsStoppedUpdate);
            } else {
                // there is a CANT_CONTINUE error code but we can likely treat all errors like a CANT_CONTINUE
                this.emit('cannot-continue');
            }
            return stepResult;
        }
    }

    public async threads() {
        if (this.isStopped) {
            let result = await this.sendRequest<ThreadsResponse>(
                ThreadsRequest.fromJson({
                    requestId: this.requestIdSequence++
                })
            );

            if (result.data.errorCode === ErrorCode.OK) {
                //older versions of the debug protocol had issues with maintaining the active thread, so our workaround is to keep track of it elsewhere
                if (this.enableThreadHoppingWorkaround) {
                    //ignore the `isPrimary` flag on threads
                    this.logger.debug(`Ignoring the 'isPrimary' flag from threads because protocol version 3.0.0 and lower has a bug`);
                } else {
                    //trust the debug protocol's `isPrimary` flag on threads
                    for (let i = 0; i < result.data.threads.length; i++) {
                        let thread = result.data.threads[i];
                        if (thread.isPrimary) {
                            this.primaryThread = i;
                            break;
                        }
                    }
                }
            }
            return result;
        }
    }

    /**
     * Get the stackTrace from the device IF currently stopped
     */
    public async getStackTrace(threadIndex: number = this.primaryThread) {
        if (this.isStopped && threadIndex > -1) {
            this.logger.log('getStackTrace()', { threadIndex: threadIndex });
            return this.sendRequest<StackTraceResponse>(
                StackTraceRequest.fromJson({
                    requestId: this.requestIdSequence++,
                    threadIndex: threadIndex
                })
            );
        } else {
            this.logger.log('[getStackTrace] skipped. ', { isStopped: this.isStopped, threadIndex: threadIndex });
        }
    }

    /**
     * @param variablePathEntries One or more path entries to the variable to be inspected. E.g., m.top.myObj["someKey"] can be accessed with ["m","top","myobj","\"someKey\""].
     *
     *                            If no path is specified, the variables accessible from the specified stack frame are returned.
     *
     *                            Starting in protocol v3.1.0, The keys for indexed gets (i.e. obj["key"]) should be wrapped in quotes so they can be handled in a case-sensitive fashion (if applicable on device).
     *                            All non-quoted keys (i.e. strings without leading and trailing quotes inside them) will be treated as case-insensitive).
     * @param getChildKeys  If set, VARIABLES response include the child keys for container types like lists and associative arrays
     * @param stackFrameIndex 0 = first function called, nframes-1 = last function. This indexing does not match the order of the frames returned from the STACKTRACE command
     * @param threadIndex the index (or perhaps ID?) of the thread to get variables for
     */
    public async getVariables(variablePathEntries: Array<string> = [], stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.isStopped && threadIndex > -1) {
            const request = VariablesRequest.fromJson({
                requestId: this.requestIdSequence++,
                threadIndex: threadIndex,
                stackFrameIndex: stackFrameIndex,
                getChildKeys: true,
                variablePathEntries: variablePathEntries.map(x => ({
                    //remove leading and trailing quotes
                    name: x.replace(/^"/, '').replace(/"$/, ''),
                    forceCaseInsensitive: !x.startsWith('"') && !x.endsWith('"')
                })),
                //starting in protocol v3.1.0, it supports marking certain path items as case-insensitive (i.e. parts of DottedGet expressions)
                enableForceCaseInsensitivity: semver.satisfies(this.protocolVersion, '>=3.1.0') && variablePathEntries.length > 0
            });
            return this.sendRequest<VariablesResponse>(request);
        }
    }

    public async executeCommand(sourceCode: string, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.isStopped && threadIndex > -1) {
            return this.sendRequest<ExecuteV3Response>(
                ExecuteRequest.fromJson({
                    requestId: this.requestIdSequence++,
                    threadIndex: threadIndex,
                    stackFrameIndex: stackFrameIndex,
                    sourceCode: sourceCode
                })
            );
        }
    }

    public async addBreakpoints(breakpoints: Array<BreakpointSpec & { componentLibraryName?: string }>): Promise<AddBreakpointsResponse> {
        const { enableComponentLibrarySpecificBreakpoints } = this;
        if (breakpoints?.length > 0) {
            const json = {
                requestId: this.requestIdSequence++,
                breakpoints: breakpoints.map(x => {
                    let breakpoint = {
                        ...x,
                        ignoreCount: x.hitCount
                    };
                    if (enableComponentLibrarySpecificBreakpoints && breakpoint.componentLibraryName) {
                        breakpoint.filePath = breakpoint.filePath.replace(/^pkg:\//i, `lib:/${breakpoint.componentLibraryName}/`);
                    }
                    return breakpoint;
                })
            };

            if (this.supportsConditionalBreakpoints) {
                return this.sendRequest<AddBreakpointsResponse>(
                    AddConditionalBreakpointsRequest.fromJson(json)
                );
            } else {
                return this.sendRequest<AddBreakpointsResponse>(
                    AddBreakpointsRequest.fromJson(json)
                );
            }
        }
        return AddBreakpointsResponse.fromBuffer(null);
    }

    public async listBreakpoints(): Promise<ListBreakpointsResponse> {
        return this.sendRequest<ListBreakpointsResponse>(
            ListBreakpointsRequest.fromJson({
                requestId: this.requestIdSequence++
            })
        );
    }

    public async removeBreakpoints(breakpointIds: number[]): Promise<RemoveBreakpointsResponse> {
        if (breakpointIds?.length > 0) {
            const command = RemoveBreakpointsRequest.fromJson({
                requestId: this.requestIdSequence++,
                breakpointIds: breakpointIds
            });
            return this.sendRequest<RemoveBreakpointsResponse>(command);
        }
        return RemoveBreakpointsResponse.fromJson(null);
    }

    /**
     * Send a request to the roku device, and get a promise that resolves once we have received the response
     */
    private async sendRequest<T>(request: ProtocolRequest) {
        this.activeRequests.set(request.data.requestId, request);

        return new Promise<T>((resolve) => {
            let unsubscribe = this.on('response', (event) => {
                if (event.data.requestId === request.data.requestId) {
                    unsubscribe();
                    this.activeRequests.delete(request.data.requestId);
                    resolve(event as unknown as T);
                }
            });

            this.logger.debug('makeRequest', `requestId=${request.data.requestId}`, request);
            if (this.controllerClient) {
                const buffer = request.toBuffer();
                this.controllerClient.write(buffer);
            } else {
                throw new Error(`Controller connection was closed - Command: ${Command[request.data.command]}`);
            }
        });
    }

    private process(): void {
        try {
            if (this.buffer.length < 1) {
                // short circuit if the buffer is empty
                return;
            }

            this.logger.log('process(): buffer=', this.buffer.toJSON());

            const event = this.getResponseOrUpdate(this.buffer);

            //if the event failed to parse, or the buffer doesn't have enough bytes to satisfy the packetLength, exit here (new data will re-trigger this function)
            if (!event) {
                this.logger.log('Unable to convert buffer into anything meaningful');
                //TODO what should we do about this?
                return;
            }
            if (!event.success || event.data.packetLength > this.buffer.length) {
                this.logger.log(`event parse failed. ${event?.data?.packetLength} bytes required, ${this.buffer.length} bytes available`);
                return;
            }

            //we have a valid event. Clear the buffer of this data
            this.buffer = this.buffer.slice(event.readOffset);

            //TODO why did we ever do this? Just to handle when we misread incoming data? I think this should be scrapped
            // if (event.data.requestId > this.totalRequests) {
            //     this.removedProcessedBytes(genericResponse, slicedBuffer, packetLength);
            //     return true;
            // }

            if (event.data.errorCode !== ErrorCode.OK) {
                this.logger.error(event.data.errorCode, event);
                // return;
            }

            //we got a response
            if (event) {
                //emit the corresponding event
                if (isProtocolUpdate(event)) {
                    this.emit('update', event);
                } else {
                    this.emit('response', event);
                }
            }

            // process again (will run recursively until the buffer is empty)
            this.process();
        } catch (e) {
            this.logger.error(`process() failed:`, e);
        }
    }

    /**
     * Given a buffer, try to parse into a specific ProtocolResponse or ProtocolUpdate
     */
    private getResponseOrUpdate(buffer: Buffer): ProtocolResponse | ProtocolUpdate {
        //if we haven't seen a handshake yet, try to convert the buffer into a handshake
        if (!this.isHandshakeComplete) {
            //try building the v3 handshake response first
            let handshakev3 = HandshakeV3Response.fromBuffer(buffer);
            if (handshakev3.success) {
                return handshakev3;
            }
            //we didn't get a v3 handshake. try building an older handshake response
            let handshake = HandshakeResponse.fromBuffer(buffer);
            if (handshake.success) {
                return handshake;
            }
        }

        let genericResponse = this.watchPacketLength ? GenericV3Response.fromBuffer(buffer) : GenericResponse.fromBuffer(buffer);

        //if the response has a non-OK error code, we won't receive the expected response type,
        //so return the generic response
        if (genericResponse.success && genericResponse.data.errorCode !== ErrorCode.OK) {
            return genericResponse;
        }
        // a nonzero requestId means this is a response to a request that we sent
        if (genericResponse.data.requestId !== 0) {
            //requestId 0 means this is an update
            return this.getResponse(genericResponse);
        } else {
            return this.getUpdate();
        }
    }

    private getResponse(genericResponse: GenericV3Response): ProtocolResponse {
        const request = this.activeRequests.get(genericResponse.data.requestId);
        if (!request) {
            return;
        }
        switch (request.data.command) {
            case Command.Stop:
            case Command.Continue:
            case Command.Step:
            case Command.ExitChannel:
                return genericResponse;
            case Command.Execute:
                return ExecuteV3Response.fromBuffer(this.buffer);
            case Command.AddBreakpoints:
            case Command.AddConditionalBreakpoints:
                return AddBreakpointsResponse.fromBuffer(this.buffer);
            case Command.ListBreakpoints:
                return ListBreakpointsResponse.fromBuffer(this.buffer);
            case Command.RemoveBreakpoints:
                return RemoveBreakpointsResponse.fromBuffer(this.buffer);
            case Command.Variables:
                return VariablesResponse.fromBuffer(this.buffer);
            case Command.StackTrace:
                return this.watchPacketLength ? StackTraceV3Response.fromBuffer(this.buffer) : StackTraceResponse.fromBuffer(this.buffer);
            case Command.Threads:
                return ThreadsResponse.fromBuffer(this.buffer);
            default:
                return undefined;
        }
    }

    private getUpdate(): ProtocolUpdate {
        //read the update_type from the buffer (save some buffer parsing time by narrowing to the exact update type)
        const updateTypeCode = this.buffer.readUInt32LE(
            // if the protocol supports packet length, then update_type is bytes 12-16. Otherwise, it's bytes 8-12
            this.watchPacketLength ? 12 : 8
        );
        const updateType = UpdateTypeCode[updateTypeCode] as UpdateType;

        this.logger.log('getUpdate(): update Type:', updateType);
        switch (updateType) {
            case UpdateType.IOPortOpened:
                //TODO handle this
                return IOPortOpenedUpdate.fromBuffer(this.buffer);
            case UpdateType.AllThreadsStopped:
                return AllThreadsStoppedUpdate.fromBuffer(this.buffer);
            case UpdateType.ThreadAttached:
                return ThreadAttachedUpdate.fromBuffer(this.buffer);
            case UpdateType.BreakpointError:
                //we do nothing with breakpoint errors at this time.
                return BreakpointErrorUpdate.fromBuffer(this.buffer);
            case UpdateType.CompileError:
                return CompileErrorUpdate.fromBuffer(this.buffer);
            default:
                return undefined;
        }
    }

    /**
     * Handle/process any received updates from the debug protocol
     */
    private handleUpdate(update: ProtocolUpdate) {
        if (update instanceof AllThreadsStoppedUpdate || update instanceof ThreadAttachedUpdate) {
            this.isStopped = true;
            let eventName: 'runtime-error' | 'suspend' = (update.data.stopReason === StopReason.RuntimeError ? 'runtime-error' : 'suspend');

            const isValidStopReason = [StopReason.RuntimeError, StopReason.Break, StopReason.StopStatement].includes(update.data.stopReason);

            if (update instanceof AllThreadsStoppedUpdate && isValidStopReason) {
                this.primaryThread = update.data.threadIndex;
                this.stackFrameIndex = 0;
                this.emit(eventName, update);
            } else if (update instanceof ThreadAttachedUpdate && isValidStopReason) {
                this.primaryThread = update.data.threadIndex;
                this.emit(eventName, update);
            }

        } else if (update instanceof IOPortOpenedUpdate) {
            this.connectToIoPort(update);
        }
    }

    /**
     * Verify all the handshake data
     */
    private verifyHandshake(response: HandshakeResponse | HandshakeV3Response): boolean {
        if (DebugProtocolClient.DEBUGGER_MAGIC === response.data.magic) {
            this.logger.log('Magic is valid.');

            this.protocolVersion = response.data.protocolVersion;
            this.logger.log('Protocol Version:', this.protocolVersion);

            this.watchPacketLength = semver.satisfies(this.protocolVersion, '>=3.0.0');

            let handshakeVerified = true;

            if (semver.satisfies(this.protocolVersion, this.supportedVersionRange)) {
                this.logger.log('supported');
                this.emit('protocol-version', {
                    message: `Protocol Version ${this.protocolVersion} is supported!`,
                    errorCode: PROTOCOL_ERROR_CODES.SUPPORTED
                });
            } else if (semver.gtr(this.protocolVersion, this.supportedVersionRange)) {
                this.logger.log('roku-debug has not been tested against protocol version', this.protocolVersion);
                this.emit('protocol-version', {
                    message: `Protocol Version ${this.protocolVersion} has not been tested and my not work as intended.\nPlease open any issues you have with this version to https://github.com/rokucommunity/roku-debug/issues`,
                    errorCode: PROTOCOL_ERROR_CODES.NOT_TESTED
                });
            } else {
                this.logger.log('not supported');
                this.emit('protocol-version', {
                    message: `Protocol Version ${this.protocolVersion} is not supported.\nIf you believe this is an error please open an issue at https://github.com/rokucommunity/roku-debug/issues`,
                    errorCode: PROTOCOL_ERROR_CODES.NOT_SUPPORTED
                });
                this.shutdown('close');
                handshakeVerified = false;
            }

            this.emit('handshake-verified', handshakeVerified);
            return handshakeVerified;
        } else {
            this.logger.log('Closing connection due to bad debugger magic', response.data.magic);
            this.emit('handshake-verified', false);
            this.shutdown('close');
            return false;
        }
    }

    /**
     * When the debugger emits the IOPortOpenedUpdate, we need to immediately connect to the IO port to start receiving that data
     */
    private connectToIoPort(update: IOPortOpenedUpdate) {
        this.logger.log('Connecting to IO port. response status success =', update.success);
        if (update.success) {
            // Create a new TCP client.
            this.ioClient = new Net.Socket();
            // Send a connection request to the server.
            this.logger.log('Connect to IO Port: port', update.data, 'host', this.options.host);
            this.ioClient.connect({
                port: update.data.port,
                host: this.options.host
            }, () => {
                // If there is no error, the server has accepted the request
                this.logger.log('TCP connection established with the IO Port.');
                this.connectedToIoPort = true;

                let lastPartialLine = '';
                this.ioClient.on('data', (buffer) => {
                    let responseText = buffer.toString();
                    if (!responseText.endsWith('\n')) {
                        // buffer was split, save the partial line
                        lastPartialLine += responseText;
                    } else {
                        if (lastPartialLine) {
                            // there was leftover lines, join the partial lines back together
                            responseText = lastPartialLine + responseText;
                            lastPartialLine = '';
                        }
                        // Emit the completed io string.
                        this.emit('io-output', responseText.trim());
                    }
                });

                this.ioClient.on('end', () => {
                    this.ioClient.end();
                    this.logger.log('Requested an end to the IO connection');
                });

                // Don't forget to catch error, for your own sake.
                this.ioClient.once('error', (err) => {
                    this.ioClient.end();
                    this.logger.error(err);
                });
            });
            return true;
        }
        return false;
    }

    public destroy() {
        this.shutdown('close');
    }

    private shutdown(eventName: 'app-exit' | 'close') {
        if (this.controllerClient) {
            this.controllerClient.removeAllListeners();
            this.controllerClient.destroy();
            this.controllerClient = undefined;
        }

        if (this.ioClient) {
            this.ioClient.removeAllListeners();
            this.ioClient.destroy();
            this.ioClient = undefined;
        }

        this.emit(eventName);
    }
}

export interface ProtocolVersionDetails {
    message: string;
    errorCode: PROTOCOL_ERROR_CODES;
}

export interface BreakpointSpec {
    /**
     * The path of the source file where the breakpoint is to be inserted.
     */
    filePath: string;
    /**
     * The (1-based) line number in the channel application code where the breakpoint is to be executed.
     */
    lineNumber: number;
    /**
     * The number of times to ignore the breakpoint condition before executing the breakpoint. This number is decremented each time the channel application reaches the breakpoint.
     */
    hitCount?: number;
    /**
     * BrightScript code that evaluates to a boolean value. The expression is compiled and executed in
     * the context where the breakpoint is located. If specified, the hitCount is only be
     * updated if this evaluates to true.
     * @avaiable since protocol version 3.1.0
     */
    conditionalExpression?: string;
}

export interface ConstructorOptions {
    /**
     * The host/ip address of the Roku
     */
    host: string;
    /**
     * The port number used to send all debugger commands. This is static/unchanging for Roku devices,
     * but is configurable here to support unit testing or alternate runtimes (i.e. https://www.npmjs.com/package/brs)
     */
    controllerPort?: number;
    /**
     * The interval (in milliseconds) for how frequently the `connect`
     * call should retry connecting to the controller port. At the start of a debug session,
     * the protocol debugger will start trying to connect the moment the channel is sideloaded,
     * and keep trying until a successful connection is established or the debug session is terminated
     * @default 250
     */
    controllerConnectInterval?: number;
    /**
     * The maximum time (in milliseconds) the debugger will keep retrying connections.
     * This is here to prevent infinitely pinging the Roku device.
     */
    controllerConnectMaxTime?: number;
}

/**
 * Is the event a ProtocolUpdate update
 */
export function isProtocolUpdate(event: ProtocolUpdate | ProtocolResponse): event is ProtocolUpdate {
    return event?.constructor?.name.endsWith('Update') && event?.data?.requestId === 0;
}
/**
 * Is the event a ProtocolResponse
 */
export function isProtocolResponse(event: ProtocolUpdate | ProtocolResponse): event is ProtocolResponse {
    return event?.constructor?.name.endsWith('Response') && event?.data?.requestId !== 0;
}
