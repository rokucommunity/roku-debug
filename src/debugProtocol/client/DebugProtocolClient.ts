import * as Net from 'net';
import * as EventEmitter from 'eventemitter3';
import * as semver from 'semver';
import { PROTOCOL_ERROR_CODES, COMMANDS, STEP_TYPE, StopReasonCode, VARIABLE_REQUEST_FLAGS, ERROR_CODES, UPDATE_TYPES } from '../Constants';
import { SmartBuffer } from 'smart-buffer';
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
import { GenericResponse, IOPortOpenedUpdate, StackTraceResponse, StackTraceResponseV3, ThreadAttachedUpdate, ThreadsResponse, UndefinedResponse, VariablesResponse } from '../events/zzresponsesOld';
import { AllThreadsStoppedUpdate } from '../events/updates/AllThreadsStoppedUpdate';
import { buffer } from 'rxjs';
import { CompileErrorUpdate } from '../events/updates/CompileErrorUpdate';

export class DebugProtocolClient {

    private logger = logger.createLogger(`[${DebugProtocolClient.name}]`);

    public get isStopped(): boolean {
        return this.stopped;
    }

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
    private stopped = false;
    private totalRequests = 0;
    private activeRequests1 = new Map<number, ProtocolRequest>();
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
    public once(eventName: 'data'): Promise<any>;
    public once(eventName: 'runtime-error' | 'suspend'): Promise<UpdateThreadsResponse>;
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
    public on(eventName: 'runtime-error' | 'suspend', handler: (data: UpdateThreadsResponse) => void);
    public on(eventName: 'io-output', handler: (output: string) => void);
    public on(eventName: 'protocol-version', handler: (data: ProtocolVersionDetails) => void);
    public on(eventName: 'handshake-verified', handler: (data: HandshakeResponse) => void);
    // public on(eventname: 'rendezvous', handler: (output: RendezvousHistory) => void);
    // public on(eventName: 'runtime-error', handler: (error: BrightScriptRuntimeError) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter?.removeListener(eventName, handler);
        };
    }

    private emit(eventName: 'response', response: ProtocolResponse);
    private emit(eventName: 'update', update: ProtocolUpdate);
    private emit(eventName: 'suspend' | 'runtime-error', data: UpdateThreadsResponse);
    private emit(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'data' | 'handshake-verified' | 'io-output' | 'protocol-version' | 'start', data?);
    private emit(eventName: string, data?) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            this.emitter?.emit(eventName, data);
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
        this.on('update', this.handleUpdate.bind(this));

        //send the magic, which triggers the debug session
        this.logger.log('Sending magic to server');

        //send the handshake request, and wait for the handshake response from the device
        const response = await this.makeRequest<HandshakeV3Response | HandshakeResponse>(
            HandshakeRequest.fromJson({
                magic: DebugProtocolClient.DEBUGGER_MAGIC
            })
        );

        this.verifyHandshake(response);
        this.isHandshakeComplete = true;
        return response.success;
    }

    public async continue() {
        if (this.stopped) {
            this.stopped = false;
            return this.makeRequest<GenericResponse>(
                ContinueRequest.fromJson({
                    requestId: this.totalRequests++
                })
            );
        }
    }

    public async pause(force = false) {
        if (!this.stopped || force) {
            return this.makeRequest<GenericResponse>(
                StopRequest.fromJson({
                    requestId: this.totalRequests++
                })
            );
        }
    }

    public async exitChannel() {
        return this.makeRequest<GenericResponse>(
            ExitChannelRequest.fromJson({
                requestId: this.totalRequests++
            })
        );
    }

    public async stepIn(threadIndex: number = this.primaryThread) {
        return this.step(STEP_TYPE.STEP_TYPE_LINE, threadIndex);
    }

    public async stepOver(threadIndex: number = this.primaryThread) {
        return this.step(STEP_TYPE.STEP_TYPE_OVER, threadIndex);
    }

    public async stepOut(threadIndex: number = this.primaryThread) {
        return this.step(STEP_TYPE.STEP_TYPE_OUT, threadIndex);
    }

    private async step(stepType: STEP_TYPE, threadIndex: number): Promise<GenericResponse> {
        this.logger.log('[step]', { stepType: STEP_TYPE[stepType], threadId: threadIndex, stopped: this.stopped });

        let buffer = new SmartBuffer({ size: 17 });
        buffer.writeUInt32LE(threadIndex); // thread_index
        buffer.writeUInt8(stepType); // step_type
        if (this.stopped) {
            this.stopped = false;
            let stepResult = await this.makeRequest<GenericResponse>(
                StepRequest.fromJson({
                    requestId: this.totalRequests++,
                    stepType: stepType,
                    threadIndex: threadIndex
                })
            );
            if (stepResult.data.errorCode === ERROR_CODES.OK) {
                // this.stopped = true;
                // this.emit('suspend');
            } else {
                // there is a CANT_CONTINUE error code but we can likely treat all errors like a CANT_CONTINUE
                this.emit('cannot-continue');
            }
            return stepResult;
        }
    }

    public async threads() {
        if (this.stopped) {
            let result = await this.makeRequest<ThreadsResponse>(
                ThreadsRequest.fromJson({
                    requestId: this.totalRequests++
                }));

            if (result.errorCode === ERROR_CODES.OK) {
                //older versions of the debug protocol had issues with maintaining the active thread, so our workaround is to keep track of it elsewhere
                if (this.enableThreadHoppingWorkaround) {
                    //ignore the `isPrimary` flag on threads
                    this.logger.debug(`Ignoring the 'isPrimary' flag from threads because protocol version ${this.protocolVersion} and lower has a bug`);
                } else {
                    //trust the debug protocol's `isPrimary` flag on threads
                    for (let i = 0; i < result.threadsCount; i++) {
                        let thread = result.threads[i];
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

    public async stackTrace(threadIndex: number = this.primaryThread) {
        let buffer = new SmartBuffer({ size: 16 });
        buffer.writeUInt32LE(threadIndex); // thread_index
        if (this.stopped && threadIndex > -1) {
            return this.makeRequest<StackTraceResponse>(
                StackTraceRequest.fromJson({
                    requestId: this.totalRequests++,
                    threadIndex: threadIndex
                })
            );
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
    public async getVariables(variablePathEntries: Array<string> = [], getChildKeys = true, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.stopped && threadIndex > -1) {
            const request = VariablesRequest.fromJson({
                requestId: this.totalRequests++,
                threadIndex: threadIndex,
                stackFrameIndex: stackFrameIndex,
                getChildKeys: getChildKeys,
                variablePathEntries: variablePathEntries.map(x => ({
                    //remove leading and trailing quotes
                    name: x.replace(/^"/, '').replace(/"$/, ''),
                    isCaseSensitive: x.startsWith('"') && x.endsWith('"')
                })),
                //starting in protocol v3.1.0, it supports marking certain path items as case-insensitive (i.e. parts of DottedGet expressions)
                enableCaseInsensitivityFlag: semver.satisfies(this.protocolVersion, '>=3.1.0') && variablePathEntries.length > 0
            });
            return this.makeRequest<VariablesResponse>(request);
        }
    }

    public async executeCommand(sourceCode: string, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.stopped && threadIndex > -1) {
            return this.makeRequest<ExecuteV3Response>(
                ExecuteRequest.fromJson({
                    requestId: this.totalRequests++,
                    threadIndex: threadIndex,
                    stackFrameIndex: stackFrameIndex,
                    sourceCode: sourceCode
                })
            );
        }
    }

    public async addBreakpoints(breakpoints: Array<BreakpointSpec & { componentLibraryName: string }>): Promise<AddBreakpointsResponse> {
        const { enableComponentLibrarySpecificBreakpoints } = this;
        if (breakpoints?.length > 0) {
            const json = {
                requestId: this.totalRequests++,
                breakpoints: breakpoints.map(x => ({
                    ...x,
                    ignoreCount: x.hitCount
                }))
            };

            if (this.supportsConditionalBreakpoints) {
                return this.makeRequest<AddBreakpointsResponse>(
                    AddBreakpointsRequest.fromJson(json)
                );
            } else {
                return this.makeRequest<AddBreakpointsResponse>(
                    AddConditionalBreakpointsRequest.fromJson(json)
                );
            }
        }
        return AddBreakpointsResponse.fromBuffer(null);
    }

    public async listBreakpoints(): Promise<ListBreakpointsResponse> {
        return this.makeRequest<ListBreakpointsResponse>(
            ListBreakpointsRequest.fromJson({
                requestId: this.totalRequests++
            })
        );
    }

    public async removeBreakpoints(breakpointIds: number[]): Promise<RemoveBreakpointsResponse> {
        if (breakpointIds?.length > 0) {
            const command = RemoveBreakpointsRequest.fromJson({
                requestId: this.totalRequests++,
                breakpointIds: breakpointIds
            });
            return this.makeRequest<RemoveBreakpointsResponse>(command);
        }
        return RemoveBreakpointsResponse.fromJson(null);
    }

    private async makeRequest<T>(request: ProtocolRequest) {
        this.totalRequests++;
        let requestId = this.totalRequests;

        this.activeRequests1.set(requestId, request);

        return new Promise<T>((resolve, reject) => {
            let unsubscribe = this.on('response', (event) => {
                if (event.data.requestId === requestId) {
                    unsubscribe();
                    resolve(event as T);
                }
            });

            this.logger.debug('makeRequest', `requestId=${requestId}`, this.activeRequests1.get(requestId));
            if (this.controllerClient) {
                this.controllerClient.write(request.toBuffer());
            } else {
                throw new Error(`Controller connection was closed - Command: ${COMMANDS[request.data.commandCode]}`);
            }
        });
    }

    private process(): boolean {
        if (this.buffer.length < 1) {
            // short circuit if the buffer is empty
            return false;
        }

        const event = this.getResponseOrUpdate(this.buffer);
        if (!event.success) {
            //TODO do something about this
        }
        //TODO do something about this too
        if (event.data.requestId > this.totalRequests) {
            this.removedProcessedBytes(genericResponse, slicedBuffer, packetLength);
            return true;
        }

        if (event.data.errorCode !== ERROR_CODES.OK) {
            this.logger.error(event.data.errorCode, event);
            this.removedProcessedBytes(genericResponse, buffer, packetLength);
            return true;
        }

        //we got a response
        if (event) {
            //find any matching request for this response/update
            const request = this.activeRequests1.get(event.data.requestId);

            if (request) {
                // we received a response for this request, so remove the request from the list
                this.activeRequests1.delete(event.data.requestId);
            }

            this.emit('data', event);

            //remove the processed data from the buffer
            this.buffer = this.buffer.slice(event.readOffset);
            this.logger.debug('[raw]', `requestId=${event.data.requestId}`, request, event.constructor?.name ?? '', event);
        }

        //TODO remove processed bytes no matter what the response was
        //TODO if the event's readOffset is larger than the current buffer, we haven't received enough data yet. Don't clear the buffer

        // process again (will run recursively until the buffer is empty)
        this.process();
    }

    /**
     * Given a buffer, try to parse into a specific ProtocolResponse or ProtocolUpdate
     */
    private getResponseOrUpdate(buffer: Buffer): ProtocolResponse {
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
        // a nonzero requestId means this is a response to a request that we sent
        if (genericResponse.data.requestId !== 0) {
            //requestId 0 means this is an update
            return this.getResponse(genericResponse);
        } else {
            return this.getUpdate(genericResponse);
        }
    }

    private getResponse(genericResponse: GenericV3Response): ProtocolResponse {
        const request = this.activeRequests1.get(genericResponse.data.requestId);
        if (!request) {
            return;
        }
        switch (request.data.commandCode) {
            case COMMANDS.STOP:
            case COMMANDS.CONTINUE:
            case COMMANDS.STEP:
            case COMMANDS.EXIT_CHANNEL:
                return genericResponse;
            case COMMANDS.EXECUTE:
                return new ExecuteV3Response(this.buffer);
            case COMMANDS.ADD_BREAKPOINTS:
            case COMMANDS.ADD_CONDITIONAL_BREAKPOINTS:
                return new AddBreakpointsResponse(this.buffer);
            case COMMANDS.LIST_BREAKPOINTS:
                return ListBreakpointsResponse.fromBuffer(this.buffer);
            case COMMANDS.REMOVE_BREAKPOINTS:
                return RemoveBreakpointsResponse.fromBuffer(this.buffer);
            case COMMANDS.VARIABLES:
                return new VariablesResponse(this.buffer);
            case COMMANDS.STACKTRACE:
                return this.checkResponse(
                    packetLength ? new StackTraceResponseV3(slicedBuffer) : new StackTraceResponse(slicedBuffer),
                    buffer,
                    packetLength);
            case COMMANDS.THREADS:
                return new ThreadsResponse(this.buffer);
            default:
                return undefined;
        }
    }

    private getUpdate(genericResponse: GenericV3Response): ProtocolUpdate {
        //read the update_type from the buffer (save some buffer parsing time by narrowing to the exact update type)
        const updateType = this.buffer.readUInt32LE(genericResponse.readOffset) as UPDATE_TYPES;

        this.logger.log('Update Type:', updateType, UPDATE_TYPES[updateType]);
        switch (updateType) {
            case UPDATE_TYPES.IO_PORT_OPENED:
                //TODO handle this
                return IOPortOpenedUpdate.fromBuffer(this.buffer);
            case UPDATE_TYPES.ALL_THREADS_STOPPED:
                return AllThreadsStoppedUpdate.fromBuffer(this.buffer);
            case UPDATE_TYPES.THREAD_ATTACHED:
                return ThreadAttachedUpdate.fromBuffer(this.buffer);
            case UPDATE_TYPES.BREAKPOINT_ERROR:
                //we do nothing with breakpoint errors at this time.
                return BreakpointErrorUpdate.fromBuffer(this.buffer);
            case UPDATE_TYPES.COMPILE_ERROR:
                return CompileErrorUpdate.fromBuffer(this.buffer);
            default:
                return undefined;
        }
    }

    private handleUpdate(update: ProtocolUpdate) {
        if (update instanceof AllThreadsStoppedUpdate || update instanceof ThreadAttachedUpdate) {
            this.stopped = true;
            let stopReason = update.data.stopReason;
            let eventName: 'runtime-error' | 'suspend' = stopReason === StopReasonCode.RuntimeError ? 'runtime-error' : 'suspend';

            if (update.data.updateType === UPDATE_TYPES.ALL_THREADS_STOPPED) {
                if (stopReason === StopReasonCode.RuntimeError || stopReason === StopReasonCode.Break || stopReason === StopReasonCode.StopStatement) {
                    this.primaryThread = (update.data as ThreadsStopped).primaryThreadIndex;
                    this.stackFrameIndex = 0;
                    this.emit(eventName, update);
                }
            } else if (stopReason === StopReasonCode.RuntimeError || stopReason === StopReasonCode.Break || stopReason === StopReasonCode.StopStatement) {
                this.primaryThread = (update.data as ThreadAttached).threadIndex;
                this.emit(eventName, update);
            }
        } else if (update instanceof IOPortOpenedUpdate) {
            this.connectToIoPort(update);
        }
    }

    private checkResponse(responseClass: { requestId: number; readOffset: number; success: boolean }, unhandledData: Buffer, packetLength = 0) {
        if (responseClass.success) {
            this.removedProcessedBytes(responseClass, unhandledData, packetLength);
            return true;
        } else if (packetLength > 0 && unhandledData.length >= packetLength) {
            this.removedProcessedBytes(responseClass, unhandledData, packetLength);
        }
        return false;
    }

    private removedProcessedBytes(response: { requestId?: number; readOffset: number }, unhandledData: Buffer, packetLength = 0) {
        const request = this.activeRequests1.get(response.requestId);
        if (response?.requestId > 0 && request) {
            this.activeRequests1.delete(response.requestId);
        }

        this.emit('data', response);

        this.buffer = unhandledData.slice(packetLength ? packetLength : response.readOffset);
        this.logger.debug('[raw]', `requestId=${response?.requestId}`, request, (response as any)?.constructor?.name ?? '', response);
        this.process(this.buffer);
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

    private connectToIoPort(update: IOPortOpenedUpdate, unhandledData: Buffer, packetLength = 0) {
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

            this.removedProcessedBytes(update, unhandledData, packetLength);
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
