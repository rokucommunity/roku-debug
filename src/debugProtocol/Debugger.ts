import * as Net from 'net';
import * as EventEmitter from 'eventemitter3';
import * as semver from 'semver';
import type {
    ThreadAttached,
    ThreadsStopped
} from './events/zzresponsesOld';
import {
    ConnectIOPortResponse,
    ProtocolEvent,
    ProtocolEventV3,
    StackTraceResponse,
    StackTraceResponseV3,
    ThreadsResponse,
    UndefinedResponse,
    UpdateThreadsResponse,
    VariableResponse
} from './events/zzresponsesOld';
import { PROTOCOL_ERROR_CODES, COMMANDS, STEP_TYPE, STOP_REASONS, VARIABLE_REQUEST_FLAGS, ERROR_CODES, UPDATE_TYPES } from './Constants';
import { SmartBuffer } from 'smart-buffer';
import { logger } from '../logging';
import { ExecuteResponseV3 } from './events/zzresponsesOld/ExecuteResponseV3';
import { ListBreakpointsResponse } from './events/responses/ListBreakpointsResponse';
import { AddBreakpointsResponse } from './events/zzresponsesOld/AddBreakpointsResponse';
import { RemoveBreakpointsResponse } from './events/zzresponsesOld/RemoveBreakpointsResponse';
import { util } from '../util';
import { BreakpointErrorUpdateResponse } from './events/zzresponsesOld/BreakpointErrorUpdateResponse';
import { ContinueRequest } from './events/requests/ContinueRequest';
import { StopRequest } from './events/requests/StopRequest';
import { ExitChannelRequest } from './events/requests/ExitChannelRequest';
import { StepRequest } from './events/requests/StepRequest';
import { RemoveBreakpointsRequest } from './events/requests/RemoveBreakpointsRequest';
import { ListBreakpointsRequest } from './events/requests/ListBreakpointsRequest';
import { VariablesRequest } from './events/requests/VariablesRequest';
import { StackTraceRequest } from './events/requests/StackTraceRequest';
import { ThreadsRequest } from './events/requests/ThreadsRequest';
import { ExecuteRequest } from './events/requests/ExecuteRequest';
import { AddBreakpointsRequest } from './events/requests/AddBreakpointsRequest';
import { AddConditionalBreakpointsRequest } from './events/requests/AddConditionalBreakpointsRequest';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from './events/ProtocolEvent';
import { HandshakeResponse } from './events/responses/HandshakeResponse';
import { HandshakeResponseV3 } from './events/responses/HandshakeResponseV3';
import { HandshakeRequest } from './events/requests/HandshakeRequest';

export class Debugger {

    private logger = logger.createLogger(`[${Debugger.name}]`);

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
            const disconnect = this.on(eventName as Parameters<Debugger['on']>[0], (...args) => {
                disconnect();
                resolve(...args);
            });
        });
    }

    public on(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start', handler: () => void);
    public on(eventName: 'data', handler: (data: ProtocolResponse | ProtocolUpdate) => void);
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

    private emit(eventName: 'response', data: { request: ProtocolRequest; response: ProtocolResponse });
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

        //send the magic, which triggers the debug session
        this.logger.log('Sending magic to server');
        //send the handshake request, and wait for the handshake response from the device
        const response = await this.makeRequest<HandshakeResponseV3 | HandshakeResponse>(
            HandshakeRequest.fromJson({
                magic: Debugger.DEBUGGER_MAGIC
            })
        );

        this.verifyHandshake(response);
        this.isHandshakeComplete = true;
        return response.success;
    }

    public async continue() {
        if (this.stopped) {
            this.stopped = false;
            return this.makeRequest<ProtocolEvent>(
                ContinueRequest.fromJson({
                    requestId: this.totalRequests++
                })
            );
        }
    }

    public async pause(force = false) {
        if (!this.stopped || force) {
            return this.makeRequest<ProtocolEvent>(
                StopRequest.fromJson({
                    requestId: this.totalRequests++
                })
            );
        }
    }

    public async exitChannel() {
        return this.makeRequest<ProtocolEvent>(
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

    private async step(stepType: STEP_TYPE, threadIndex: number): Promise<ProtocolEvent> {
        this.logger.log('[step]', { stepType: STEP_TYPE[stepType], threadId: threadIndex, stopped: this.stopped });

        let buffer = new SmartBuffer({ size: 17 });
        buffer.writeUInt32LE(threadIndex); // thread_index
        buffer.writeUInt8(stepType); // step_type
        if (this.stopped) {
            this.stopped = false;
            let stepResult = await this.makeRequest<ProtocolEvent>(
                StepRequest.fromJson({
                    requestId: this.totalRequests++,
                    stepType: stepType,
                    threadIndex: threadIndex
                })
            );
            if (stepResult.errorCode === ERROR_CODES.OK) {
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
            return this.makeRequest<VariableResponse>(request);
        }
    }

    public async executeCommand(sourceCode: string, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.stopped && threadIndex > -1) {
            return this.makeRequest<ExecuteResponseV3>(
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
        return new AddBreakpointsResponse(null);
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
        return new RemoveBreakpointsResponse(null);
    }

    private async makeRequest<T>(request: ProtocolRequest) {
        this.totalRequests++;
        let requestId = this.totalRequests;

        this.activeRequests1.set(requestId, request);

        return new Promise<T>((resolve, reject) => {
            let unsubscribe = this.on('data', (event) => {
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
            let handshakev3 = HandshakeResponseV3.fromBuffer(buffer);
            if (handshakev3.success) {
                return handshakev3;
            }
            //we didn't get a v3 handshake. try building an older handshake response
            let handshake = HandshakeResponse.fromBuffer(buffer);
            if (handshake.success) {
                return handshake;
            }
        }

        let debuggerRequestResponse = this.watchPacketLength ? new ProtocolEventV3(buffer) : new ProtocolEvent(buffer);
        let packetLength = debuggerRequestResponse.packetLength;
        let slicedBuffer = packetLength ? buffer.slice(4) : buffer;

        this.logger.log(`incoming bytes: ${buffer.length}`, debuggerRequestResponse);
        if (debuggerRequestResponse.success) {
            if (debuggerRequestResponse.requestId > this.totalRequests) {
                this.removedProcessedBytes(debuggerRequestResponse, slicedBuffer, packetLength);
                return true;
            }

            if (debuggerRequestResponse.errorCode !== ERROR_CODES.OK) {
                this.logger.error(debuggerRequestResponse.errorCode, debuggerRequestResponse);
                this.removedProcessedBytes(debuggerRequestResponse, buffer, packetLength);
                return true;
            }

            if (debuggerRequestResponse.updateType > 0) {
                this.logger.log('Update Type:', UPDATE_TYPES[debuggerRequestResponse.updateType]);
                switch (debuggerRequestResponse.updateType) {
                    case UPDATE_TYPES.IO_PORT_OPENED:
                        return this.connectToIoPort(new ConnectIOPortResponse(slicedBuffer), buffer, packetLength);
                    case UPDATE_TYPES.ALL_THREADS_STOPPED:
                    case UPDATE_TYPES.THREAD_ATTACHED:
                        let debuggerUpdateThreads = new UpdateThreadsResponse(slicedBuffer);
                        if (debuggerUpdateThreads.success) {
                            this.handleThreadsUpdate(debuggerUpdateThreads);
                            this.removedProcessedBytes(debuggerUpdateThreads, slicedBuffer, packetLength);
                            return true;
                        }
                        return false;
                    case UPDATE_TYPES.UNDEF:
                        return this.checkResponse(new UndefinedResponse(slicedBuffer), buffer, packetLength);
                    case UPDATE_TYPES.BREAKPOINT_ERROR:
                        const response = new BreakpointErrorUpdateResponse(slicedBuffer);
                        //we do nothing with breakpoint errors at this time.
                        return this.checkResponse(response, buffer, packetLength);
                    case UPDATE_TYPES.COMPILE_ERROR:
                        return this.checkResponse(new UndefinedResponse(slicedBuffer), buffer, packetLength);
                    default:
                        return this.checkResponse(new UndefinedResponse(slicedBuffer), buffer, packetLength);
                }
            } else {
                const request = this.activeRequests1.get(debuggerRequestResponse.requestId);
                this.logger.log('Command Type:', COMMANDS[request.data.commandCode]);
                switch (request.data.commandCode) {
                    case COMMANDS.STOP:
                    case COMMANDS.CONTINUE:
                    case COMMANDS.STEP:
                    case COMMANDS.EXIT_CHANNEL:
                        this.removedProcessedBytes(debuggerRequestResponse, buffer, packetLength);
                        return true;
                    case COMMANDS.EXECUTE:
                        return this.checkResponse(new ExecuteResponseV3(slicedBuffer), buffer, packetLength);
                    case COMMANDS.ADD_BREAKPOINTS:
                    case COMMANDS.ADD_CONDITIONAL_BREAKPOINTS:
                        return this.checkResponse(new AddBreakpointsResponse(slicedBuffer), buffer, packetLength);
                    case COMMANDS.LIST_BREAKPOINTS:
                        return this.checkResponse(new ListBreakpointsResponse(slicedBuffer), buffer, packetLength);
                    case COMMANDS.REMOVE_BREAKPOINTS:
                        return this.checkResponse(new RemoveBreakpointsResponse(slicedBuffer), buffer, packetLength);
                    case COMMANDS.VARIABLES:
                        return this.checkResponse(new VariableResponse(slicedBuffer), buffer, packetLength);
                    case COMMANDS.STACKTRACE:
                        return this.checkResponse(
                            packetLength ? new StackTraceResponseV3(slicedBuffer) : new StackTraceResponse(slicedBuffer),
                            buffer,
                            packetLength);
                    case COMMANDS.THREADS:
                        return this.checkResponse(new ThreadsResponse(slicedBuffer), buffer, packetLength);
                    default:
                        return this.checkResponse(debuggerRequestResponse, buffer, packetLength);
                }
            }
        }

        return false;
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
    private verifyHandshake(response: HandshakeResponse | HandshakeResponseV3): boolean {
        if (Debugger.DEBUGGER_MAGIC === response.data.magic) {
            this.logger.log('Magic is valid.');

            this.protocolVersion = response.data.protocolVersion;
            this.logger.log('Protocol Version:', this.protocolVersion);

            this.watchPacketLength = response.watchPacketLength;

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

    private connectToIoPort(connectIoPortResponse: ConnectIOPortResponse, unhandledData: Buffer, packetLength = 0) {
        this.logger.log('Connecting to IO port. response status success =', connectIoPortResponse.success);
        if (connectIoPortResponse.success) {
            // Create a new TCP client.
            this.ioClient = new Net.Socket();
            // Send a connection request to the server.
            this.logger.log('Connect to IO Port: port', connectIoPortResponse.data, 'host', this.options.host);
            this.ioClient.connect({ port: connectIoPortResponse.data, host: this.options.host }, () => {
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

            this.removedProcessedBytes(connectIoPortResponse, unhandledData, packetLength);
            return true;
        }
        return false;
    }

    private handleThreadsUpdate(update: UpdateThreadsResponse) {
        this.stopped = true;
        let stopReason = update.data.stopReason;
        let eventName: 'runtime-error' | 'suspend' = stopReason === STOP_REASONS.RUNTIME_ERROR ? 'runtime-error' : 'suspend';

        if (update.updateType === UPDATE_TYPES.ALL_THREADS_STOPPED) {
            if (stopReason === STOP_REASONS.RUNTIME_ERROR || stopReason === STOP_REASONS.BREAK || stopReason === STOP_REASONS.STOP_STATEMENT) {
                this.primaryThread = (update.data as ThreadsStopped).primaryThreadIndex;
                this.stackFrameIndex = 0;
                this.emit(eventName, update);
            }
        } else if (stopReason === STOP_REASONS.RUNTIME_ERROR || stopReason === STOP_REASONS.BREAK || stopReason === STOP_REASONS.STOP_STATEMENT) {
            this.primaryThread = (update.data as ThreadAttached).threadIndex;
            this.emit(eventName, update);
        }
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
