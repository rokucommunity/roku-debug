import * as Net from 'net';
import * as EventEmitter from 'eventemitter3';
import * as semver from 'semver';
import { PROTOCOL_ERROR_CODES, Command, StepType, ErrorCode, UpdateType, UpdateTypeCode, StopReason } from '../Constants';
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
import type { StackTraceResponse } from '../events/responses/StackTraceResponse';
import { ThreadsResponse } from '../events/responses/ThreadsResponse';
import { VariablesResponse } from '../events/responses/VariablesResponse';
import { IOPortOpenedUpdate, isIOPortOpenedUpdate } from '../events/updates/IOPortOpenedUpdate';
import { ThreadAttachedUpdate } from '../events/updates/ThreadAttachedUpdate';
import { StackTraceV3Response } from '../events/responses/StackTraceV3Response';
import { ActionQueue } from '../../managers/ActionQueue';
import type { DebugProtocolClientPlugin } from './DebugProtocolClientPlugin';
import PluginInterface from '../PluginInterface';

export class DebugProtocolClient {

    public logger = logger.createLogger(`[${DebugProtocolClient.name}]`);

    // The highest tested version of the protocol we support.
    public supportedVersionRange = '<=3.0.0';

    constructor(
        options?: ConstructorOptions
    ) {
        this.options = {
            controlPort: 8081,
            host: undefined,
            //override the defaults with the options from parameters
            ...options ?? {}
        };

        //add the internal plugin last, so it's the final plugin to handle the events
        this.addCorePlugin();
    }

    private addCorePlugin() {
        this.plugins.add({
            onUpdate: (event) => {
                return this.handleUpdate(event.update);
            }
        }, 999);
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

    /**
     * A collection of plugins that can interact with the client at lifecycle points
     */
    public plugins = new PluginInterface<DebugProtocolClientPlugin>();

    private emitter = new EventEmitter();
    /**
     * The primary socket for this session. It's used to communicate with the debugger by sending commands and receives responses or updates
     */
    private controlSocket: Net.Socket;
    /**
     * A socket where the debug server will send stdio
     */
    private ioSocket: Net.Socket;
    /**
     * The buffer where all unhandled data will be stored until successfully consumed
     */
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
    public once<T = AllThreadsStoppedUpdate | ThreadAttachedUpdate>(eventName: 'runtime-error' | 'suspend'): Promise<T>;
    public once(eventName: 'io-output'): Promise<string>;
    public once(eventName: 'data'): Promise<Buffer>;
    public once(eventName: 'response'): Promise<ProtocolResponse>;
    public once(eventName: 'update'): Promise<ProtocolUpdate>;
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
    public on(eventName: 'response', handler: (response: ProtocolResponse) => void);
    public on(eventName: 'update', handler: (update: ProtocolUpdate) => void);
    /**
     * The raw data from the server socket. You probably don't need this...
     */
    public on(eventName: 'data', handler: (data: Buffer) => void);
    public on<T = AllThreadsStoppedUpdate | ThreadAttachedUpdate>(eventName: 'runtime-error' | 'suspend', handler: (data: T) => void);
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
    private emit(eventName: 'data', update: Buffer);
    private emit(eventName: 'suspend' | 'runtime-error', data: AllThreadsStoppedUpdate | ThreadAttachedUpdate);
    private emit(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'handshake-verified' | 'io-output' | 'protocol-version' | 'start', data?);
    private emit(eventName: string, data?) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            this.emitter.emit(eventName, data);
        }, 0);
    }

    private async establishControlConnection() {
        const pendingSockets = new Set<Net.Socket>();
        const connection = await new Promise<Net.Socket>((resolve) => {
            util.setInterval((cancelInterval) => {
                const socket = new Net.Socket();
                pendingSockets.add(socket);
                socket.on('error', (error) => {
                    console.debug(Date.now(), 'Encountered an error connecting to the debug protocol socket. Ignoring and will try again soon', error);
                });
                socket.connect({ port: this.options.controlPort, host: this.options.host }, () => {
                    cancelInterval();

                    this.logger.debug(`Connected to debug protocol control port. Socket ${[...pendingSockets].indexOf(socket)} of ${pendingSockets.size} was the winner`);
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
            }, this.options.controlConnectInterval ?? 250);
        });
        await this.plugins.emit('onServerConnected', {
            client: this,
            server: connection
        });
        return connection;
    }

    /**
     * A queue for processing the incoming buffer, every transmission at a time
     */
    private bufferQueue = new ActionQueue();

    /**
     * Connect to the debug server.
     * @param sendHandshake should the handshake be sent as part of this connect process. If false, `.sendHandshake()` will need to be called before a session can begin
     */
    public async connect(sendHandshake = true): Promise<boolean> {
        this.logger.log('connect', this.options);

        // If there is no error, the server has accepted the request and created a new dedicated control socket
        this.controlSocket = await this.establishControlConnection();

        this.controlSocket.on('data', (data) => {
            this.emit('data', data);
            //queue up processing the new data, chunk by chunk
            void this.bufferQueue.run(async () => {
                this.buffer = Buffer.concat([this.buffer, data]);
                while (this.buffer.length > 0 && await this.process()) {
                    //the loop condition is the actual work
                }
                return true;
            });

            // this.buffer = Buffer.concat([this.buffer, data]);

            // this.logger.debug(`on('data'): incoming bytes`, data.length);
            // const startBufferSize = this.buffer.length;

            // this.process();

            // const endBufferSize = this.buffer?.length ?? 0;
            // this.logger.debug(`buffer size before:`, startBufferSize, ', buffer size after:', endBufferSize, ', bytes consumed:', startBufferSize - endBufferSize);
        });

        this.controlSocket.on('end', () => {
            this.logger.log('TCP connection closed');
            this.shutdown('app-exit');
        });

        // Don't forget to catch error, for your own sake.
        this.controlSocket.once('error', (error) => {
            //the Roku closed the connection for some unknown reason...
            console.error(`TCP connection error on control port`, error);
            this.shutdown('close');
        });

        if (sendHandshake) {
            await this.sendHandshake();
        }
        return true;
    }

    /**
     * Send the initial handshake request, and wait for the handshake response
     */
    public async sendHandshake() {
        return this.processHandshakeRequest(
            HandshakeRequest.fromJson({
                magic: DebugProtocolClient.DEBUGGER_MAGIC
            })
        );
    }

    private async processHandshakeRequest(request: HandshakeRequest) {
        //send the magic, which triggers the debug session
        this.logger.log('Sending magic to server');

        //send the handshake request, and wait for the handshake response from the device
        return this.sendRequest<HandshakeV3Response | HandshakeResponse>(request);
    }

    public continue() {
        return this.processContinueRequest(
            ContinueRequest.fromJson({
                requestId: this.requestIdSequence++
            })
        );
    }

    private async processContinueRequest(request: ContinueRequest) {
        if (this.isStopped) {
            this.isStopped = false;
            return this.sendRequest<GenericResponse>(request);
        }
    }

    public pause() {
        return this.processStopRequest(
            StopRequest.fromJson({
                requestId: this.requestIdSequence++
            })
        );
    }

    private async processStopRequest(request: StopRequest) {
        if (this.isStopped === false) {
            return this.sendRequest<GenericResponse>(request);
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
        return this.processStepRequest(
            StepRequest.fromJson({
                requestId: this.requestIdSequence++,
                stepType: stepType,
                threadIndex: threadIndex
            })
        );
    }

    private async processStepRequest(request: StepRequest) {
        if (this.isStopped) {
            this.isStopped = false;
            let stepResult = await this.sendRequest<GenericResponse>(request);
            if (stepResult.data.errorCode === ErrorCode.OK) {
                this.isStopped = true;
                //TODO this is not correct. Do we get a new threads event after a step? Perhaps that should be what triggers the event instead of us?
                this.emit('suspend', stepResult as AllThreadsStoppedUpdate);
            } else {
                // there is a CANT_CONTINUE error code but we can likely treat all errors like a CANT_CONTINUE
                this.emit('cannot-continue');
            }
            return stepResult;
        } else {
            this.logger.log('[processStepRequest] skipped because debugger is not paused');
        }
    }

    public async threads() {
        return this.processThreadsRequest(
            ThreadsRequest.fromJson({
                requestId: this.requestIdSequence++
            })
        );
    }
    public async processThreadsRequest(request: ThreadsRequest) {
        if (this.isStopped) {
            let result = await this.sendRequest<ThreadsResponse>(request);

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
        } else {
            this.logger.log('[processThreadsRequest] skipped because not stopped');
        }
    }

    /**
     * Get the stackTrace from the device IF currently stopped
     */
    public async getStackTrace(threadIndex: number = this.primaryThread) {
        return this.processStackTraceRequest(
            StackTraceRequest.fromJson({
                requestId: this.requestIdSequence++,
                threadIndex: threadIndex
            })
        );
    }

    private async processStackTraceRequest(request: StackTraceRequest) {
        if (!this.isStopped) {
            this.logger.log('[getStackTrace] skipped because debugger is not paused');
        } else if (request?.data?.threadIndex > -1) {
            return this.sendRequest<StackTraceResponse>(request);
        } else {
            this.logger.log(`[getStackTrace] skipped because ${request?.data?.threadIndex} is not valid threadIndex`);
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
        return this.processVariablesRequest(
            VariablesRequest.fromJson({
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
            })
        );
    }

    private async processVariablesRequest(request: VariablesRequest) {
        if (this.isStopped && request.data.threadIndex > -1) {
            return this.sendRequest<VariablesResponse>(request);
        }
    }

    public async executeCommand(sourceCode: string, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        return this.processExecuteRequest(
            ExecuteRequest.fromJson({
                requestId: this.requestIdSequence++,
                threadIndex: threadIndex,
                stackFrameIndex: stackFrameIndex,
                sourceCode: sourceCode
            })
        );
    }

    private async processExecuteRequest(request: ExecuteRequest) {
        if (this.isStopped && request.data.threadIndex > -1) {
            return this.sendRequest<ExecuteV3Response>(request);
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
        return this.processRequest<ListBreakpointsResponse>(
            ListBreakpointsRequest.fromJson({
                requestId: this.requestIdSequence++
            })
        );
    }

    /**
     * Remove breakpoints having the specified IDs
     */
    public async removeBreakpoints(breakpointIds: number[]) {
        return this.processRemoveBreakpointsRequest(
            RemoveBreakpointsRequest.fromJson({
                requestId: this.requestIdSequence++,
                breakpointIds: breakpointIds
            })
        );
    }

    private async processRemoveBreakpointsRequest(request: RemoveBreakpointsRequest) {
        if (request.data.breakpointIds?.length > 0) {
            return this.sendRequest<RemoveBreakpointsResponse>(request);
        }
        return RemoveBreakpointsResponse.fromJson(null);
    }

    /**
     * Given a request, process it in the proper fashion. This is mostly used for external mocking/testing of
     * this client, but it should force the client to flow in the same fashion as a live debug session
     */
    public async processRequest<TResponse extends ProtocolResponse>(request: ProtocolRequest): Promise<TResponse> {
        switch (request?.constructor.name) {
            case ContinueRequest.name:
                return this.processContinueRequest(request as ContinueRequest) as any;

            case ExecuteRequest.name:
                return this.processExecuteRequest(request as ExecuteRequest) as any;

            case HandshakeRequest.name:
                return this.processHandshakeRequest(request as HandshakeRequest) as any;

            case RemoveBreakpointsRequest.name:
                return this.processRemoveBreakpointsRequest(request as RemoveBreakpointsRequest) as any;

            case StackTraceRequest.name:
                return this.processStackTraceRequest(request as StackTraceRequest) as any;

            case StepRequest.name:
                return this.processStepRequest(request as StepRequest) as any;

            case StopRequest.name:
                return this.processStopRequest(request as StopRequest) as any;

            case ThreadsRequest.name:
                return this.processThreadsRequest(request as ThreadsRequest) as any;

            case VariablesRequest.name:
                return this.processVariablesRequest(request as VariablesRequest) as any;

            //for all other request types, there's no custom business logic, so just pipe them through manually
            case AddBreakpointsRequest.name:
            case AddConditionalBreakpointsRequest.name:
            case ExitChannelRequest.name:
            case ListBreakpointsRequest.name:
                return this.sendRequest(request);
            default:
                this.logger.log('Unknown request type. Sending anyway...', request);
                //unknown request type. try sending it as-is
                return this.sendRequest(request);
        }
    }

    /**
     * Send a request to the roku device, and get a promise that resolves once we have received the response
     */
    private async sendRequest<T extends ProtocolResponse | ProtocolUpdate>(request: ProtocolRequest) {
        request = (await this.plugins.emit('beforeSendRequest', {
            client: this,
            request: request
        })).request;

        this.activeRequests.set(request.data.requestId, request);

        return new Promise<T>((resolve) => {
            let unsubscribe = this.on('response', (response) => {
                if (response.data.requestId === request.data.requestId) {
                    unsubscribe();
                    this.activeRequests.delete(request.data.requestId);
                    resolve(response as T);
                }
            });

            this.logger.log(`Request ${request?.data?.requestId}`, request);
            if (this.controlSocket) {
                const buffer = request.toBuffer();
                console.log('client sent', JSON.stringify(buffer.toJSON().data));
                this.controlSocket.write(buffer);
                void this.plugins.emit('afterSendRequest', {
                    client: this,
                    request: request
                });
            } else {
                throw new Error(`Control socket was closed - Command: ${Command[request.data.command]}`);
            }
        });
    }

    /**
     * Sometimes a request arrives that we don't understand. If that's the case, this function can be used
     * to discard that entire response by discarding `packet_length` number of bytes
     */
    private discardNextResponseOrUpdate() {
        const response = GenericV3Response.fromBuffer(this.buffer);
        if (response.success && response.data.packetLength > 0) {
            this.logger.warn(`Unsupported response or updated encountered. Discarding ${response.data.packetLength} bytes:`, JSON.stringify(
                this.buffer.slice(0, response.data.packetLength + 1).toJSON().data
            ));
            //we have a valid event. Clear the buffer of this data
            this.buffer = this.buffer.slice(response.data.packetLength);
        }
    }

    private async process(): Promise<boolean> {
        try {
            this.logger.info('[process()]: buffer=', this.buffer.toJSON());

            let { responseOrUpdate } = await this.plugins.emit('provideResponseOrUpdate', {
                client: this,
                activeRequests: this.activeRequests,
                buffer: this.buffer
            });

            if (!responseOrUpdate) {
                responseOrUpdate = this.getResponseOrUpdate(this.buffer);
            }

            //if the event failed to parse, or the buffer doesn't have enough bytes to satisfy the packetLength, exit here (new data will re-trigger this function)
            if (!responseOrUpdate) {
                this.logger.info('Unable to convert buffer into anything meaningful', this.buffer);
                //if we have packet length, and we have at least that many bytes, throw out this message so we can hopefully recover
                this.discardNextResponseOrUpdate();
                return false;
            }
            if (!responseOrUpdate.success || responseOrUpdate.data.packetLength > this.buffer.length) {
                this.logger.log(`event parse failed. ${responseOrUpdate?.data?.packetLength} bytes required, ${this.buffer.length} bytes available`);
                return false;
            }

            //we have a valid event. Clear the buffer of this data
            this.buffer = this.buffer.slice(responseOrUpdate.readOffset);

            //TODO why did we ever do this? Just to handle when we misread incoming data? I think this should be scrapped
            // if (event.data.requestId > this.totalRequests) {
            //     this.removedProcessedBytes(genericResponse, slicedBuffer, packetLength);
            //     return true;
            // }

            if (responseOrUpdate.data.errorCode !== ErrorCode.OK) {
                this.logger.error(responseOrUpdate.data.errorCode, responseOrUpdate);
            }

            //we got a result
            if (responseOrUpdate) {
                //emit the corresponding event
                if (isProtocolUpdate(responseOrUpdate)) {
                    this.logger.log(`Update:`, responseOrUpdate);
                    this.emit('update', responseOrUpdate);
                    await this.plugins.emit('onUpdate', {
                        client: this,
                        update: responseOrUpdate
                    });
                } else {
                    this.logger.log(`Response ${responseOrUpdate?.data?.requestId}:`, responseOrUpdate);
                    this.emit('response', responseOrUpdate);
                    await this.plugins.emit('onResponse', {
                        client: this,
                        response: responseOrUpdate as any
                    });
                }
                return true;
            }
        } catch (e) {
            this.logger.error(`process() failed:`, e);
        }
    }

    /**
     * Given a buffer, try to parse into a specific ProtocolResponse or ProtocolUpdate
     */
    public getResponseOrUpdate(buffer: Buffer): ProtocolResponse | ProtocolUpdate {
        //if we haven't seen a handshake yet, try to convert the buffer into a handshake
        if (!this.isHandshakeComplete) {
            let handshake: HandshakeV3Response | HandshakeResponse;
            //try building the v3 handshake response first
            handshake = HandshakeV3Response.fromBuffer(buffer);
            //we didn't get a v3 handshake. try building an older handshake response
            if (!handshake.success) {
                handshake = HandshakeResponse.fromBuffer(buffer);
            }
            if (handshake.success) {
                this.verifyHandshake(handshake);
                return handshake;
            }
            return;
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
            const request = this.activeRequests.get(genericResponse.data.requestId);
            if (request) {
                return DebugProtocolClient.getResponse(this.buffer, request.data.command);
            }
        } else {
            return this.getUpdate(this.buffer);
        }
    }

    public static getResponse(buffer: Buffer, command: Command) {
        switch (command) {
            case Command.Stop:
            case Command.Continue:
            case Command.Step:
            case Command.ExitChannel:
                return GenericV3Response.fromBuffer(buffer);
            case Command.Execute:
                return ExecuteV3Response.fromBuffer(buffer);
            case Command.AddBreakpoints:
            case Command.AddConditionalBreakpoints:
                return AddBreakpointsResponse.fromBuffer(buffer);
            case Command.ListBreakpoints:
                return ListBreakpointsResponse.fromBuffer(buffer);
            case Command.RemoveBreakpoints:
                return RemoveBreakpointsResponse.fromBuffer(buffer);
            case Command.Variables:
                return VariablesResponse.fromBuffer(buffer);
            case Command.StackTrace:
                return StackTraceV3Response.fromBuffer(buffer);
            case Command.Threads:
                return ThreadsResponse.fromBuffer(buffer);
            default:
                return undefined;
        }
    }

    public getUpdate(buffer: Buffer): ProtocolUpdate {
        //read the update_type from the buffer (save some buffer parsing time by narrowing to the exact update type)
        const updateTypeCode = buffer.readUInt32LE(
            // if the protocol supports packet length, then update_type is bytes 12-16. Otherwise, it's bytes 8-12
            this.watchPacketLength ? 12 : 8
        );
        const updateType = UpdateTypeCode[updateTypeCode] as UpdateType;

        this.logger?.log('getUpdate(): update Type:', updateType);
        switch (updateType) {
            case UpdateType.IOPortOpened:
                //TODO handle this
                return IOPortOpenedUpdate.fromBuffer(buffer);
            case UpdateType.AllThreadsStopped:
                return AllThreadsStoppedUpdate.fromBuffer(buffer);
            case UpdateType.ThreadAttached:
                return ThreadAttachedUpdate.fromBuffer(buffer);
            case UpdateType.BreakpointError:
                //we do nothing with breakpoint errors at this time.
                return BreakpointErrorUpdate.fromBuffer(buffer);
            case UpdateType.CompileError:
                return CompileErrorUpdate.fromBuffer(buffer);
            default:
                return undefined;
        }
    }

    private handleUpdateQueue = new ActionQueue();

    /**
     * Handle/process any received updates from the debug protocol
     */
    private async handleUpdate(update: ProtocolUpdate) {
        return this.handleUpdateQueue.run(async () => {
            update = (await this.plugins.emit('beforeHandleUpdate', {
                client: this,
                update: update
            })).update;

            if (update instanceof AllThreadsStoppedUpdate || update instanceof ThreadAttachedUpdate) {
                this.isStopped = true;

                let eventName: 'runtime-error' | 'suspend';
                if (update.data.stopReason === StopReason.RuntimeError) {
                    eventName = 'runtime-error';
                } else {
                    eventName = 'suspend';
                }

                const isValidStopReason = [StopReason.RuntimeError, StopReason.Break, StopReason.StopStatement].includes(update.data.stopReason);

                if (update instanceof AllThreadsStoppedUpdate && isValidStopReason) {
                    this.primaryThread = update.data.threadIndex;
                    this.stackFrameIndex = 0;
                    this.emit(eventName, update);
                } else if (update instanceof ThreadAttachedUpdate && isValidStopReason) {
                    this.primaryThread = update.data.threadIndex;
                    this.emit(eventName, update);
                }

            } else if (isIOPortOpenedUpdate(update)) {
                this.connectToIoPort(update);
            }
            return true;
        });
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
            this.isHandshakeComplete = true;

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
        if (update.success) {
            // Create a new TCP client.
            this.ioSocket = new Net.Socket();
            // Send a connection request to the server.
            this.logger.log(`Connect to IO Port ${this.options.host}:${update.data.port}`);
            this.ioSocket.connect({
                port: update.data.port,
                host: this.options.host
            }, () => {
                // If there is no error, the server has accepted the request
                this.logger.log('TCP connection established with the IO Port.');
                this.connectedToIoPort = true;

                let lastPartialLine = '';
                this.ioSocket.on('data', (buffer) => {
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

                this.ioSocket.on('end', () => {
                    this.ioSocket.end();
                    this.logger.log('Requested an end to the IO connection');
                });

                // Don't forget to catch error, for your own sake.
                this.ioSocket.once('error', (err) => {
                    this.ioSocket.end();
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
        if (this.controlSocket) {
            this.controlSocket.removeAllListeners();
            this.controlSocket.destroy();
            this.controlSocket = undefined;
        }

        if (this.ioSocket) {
            this.ioSocket.removeAllListeners();
            this.ioSocket.destroy();
            this.ioSocket = undefined;
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
    controlPort?: number;
    /**
     * The interval (in milliseconds) for how frequently the `connect`
     * call should retry connecting to the control port. At the start of a debug session,
     * the protocol debugger will start trying to connect the moment the channel is sideloaded,
     * and keep trying until a successful connection is established or the debug session is terminated
     * @default 250
     */
    controlConnectInterval?: number;
    /**
     * The maximum time (in milliseconds) the debugger will keep retrying connections.
     * This is here to prevent infinitely pinging the Roku device.
     */
    controlConnectMaxTime?: number;
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
