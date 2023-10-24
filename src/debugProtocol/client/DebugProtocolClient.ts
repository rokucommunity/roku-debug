import * as Net from 'net';
import * as debounce from 'debounce';
import * as EventEmitter from 'eventemitter3';
import * as semver from 'semver';
import { PROTOCOL_ERROR_CODES, Command, StepType, ErrorCode, UpdateType, UpdateTypeCode, StopReason } from '../Constants';
import { logger } from '../../logging';
import { ExecuteV3Response } from '../events/responses/ExecuteV3Response';
import { ListBreakpointsResponse } from '../events/responses/ListBreakpointsResponse';
import { AddBreakpointsResponse } from '../events/responses/AddBreakpointsResponse';
import { RemoveBreakpointsResponse } from '../events/responses/RemoveBreakpointsResponse';
import { defer, util } from '../../util';
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
import type { Variable } from '../events/responses/VariablesResponse';
import { VariablesResponse, VariableType } from '../events/responses/VariablesResponse';
import { IOPortOpenedUpdate, isIOPortOpenedUpdate } from '../events/updates/IOPortOpenedUpdate';
import { ThreadAttachedUpdate } from '../events/updates/ThreadAttachedUpdate';
import { StackTraceV3Response } from '../events/responses/StackTraceV3Response';
import { ActionQueue } from '../../managers/ActionQueue';
import type { DebugProtocolClientPlugin } from './DebugProtocolClientPlugin';
import PluginInterface from '../PluginInterface';
import type { VerifiedBreakpoint } from '../events/updates/BreakpointVerifiedUpdate';
import { BreakpointVerifiedUpdate } from '../events/updates/BreakpointVerifiedUpdate';
import type { AddConditionalBreakpointsResponse } from '../events/responses/AddConditionalBreakpointsResponse';

export class DebugProtocolClient {

    public logger = logger.createLogger(`[client]`);

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
     * Promise that is resolved when the control socket is closed
     */
    private controlSocketClosed = defer<void>();
    /**
     * A socket where the debug server will send stdio
     */
    private ioSocket: Net.Socket;
    /**
     * Resolves when the ioSocket has closed
     */
    private ioSocketClosed = defer<void>();
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

    public get supportsBreakpointRegistrationWhileRunning() {
        return semver.satisfies(this.protocolVersion, '>=3.2.0');
    }

    public get supportsBreakpointVerification() {
        return semver.satisfies(this.protocolVersion, '>=3.2.0');
    }

    /**
     * Get a promise that resolves after an event occurs exactly once
     */
    public once(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start'): Promise<void>;
    public once(eventName: 'breakpoints-verified'): Promise<BreakpointsVerifiedEvent>;
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

    public on(eventName: 'compile-error', handler: (event: CompileErrorUpdate) => void);
    public on(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start', handler: () => void);
    public on(eventName: 'breakpoints-verified', handler: (event: BreakpointsVerifiedEvent) => void);
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

    private emit(eventName: 'compile-error', response: CompileErrorUpdate);
    private emit(eventName: 'response', response: ProtocolResponse);
    private emit(eventName: 'update', update: ProtocolUpdate);
    private emit(eventName: 'data', update: Buffer);
    private emit(eventName: 'breakpoints-verified', event: BreakpointsVerifiedEvent);
    private emit(eventName: 'suspend' | 'runtime-error', data: AllThreadsStoppedUpdate | ThreadAttachedUpdate);
    private emit(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'handshake-verified' | 'io-output' | 'protocol-version' | 'start', data?);
    private async emit(eventName: string, data?) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        await util.sleep(0);
        //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
        this.emitter.emit(eventName, data);
    }

    /**
     * A function that can be used to cancel the repeating interval that's running to try and establish a connection to the control socket.
     */
    private cancelControlConnectInterval: () => void;

    /**
     * A collection of sockets created when trying to connect to the debug protocol's control socket. We keep these around for quicker tear-down
     * whenever there is an early-terminated debug session
     */
    private pendingControlConnectionSockets: Set<Net.Socket>;

    private async establishControlConnection() {
        this.pendingControlConnectionSockets = new Set<Net.Socket>();
        const connection = await new Promise<Net.Socket>((resolve) => {
            this.cancelControlConnectInterval = util.setInterval((cancelInterval) => {
                const socket = new Net.Socket({
                    allowHalfOpen: false
                });
                this.pendingControlConnectionSockets.add(socket);
                socket.on('error', (error) => {
                    console.debug(Date.now(), 'Encountered an error connecting to the debug protocol socket. Ignoring and will try again soon', error);
                });
                socket.connect({ port: this.options.controlPort, host: this.options.host }, () => {
                    cancelInterval();

                    this.logger.debug(`Connected to debug protocol control port. Socket ${[...this.pendingControlConnectionSockets].indexOf(socket)} of ${this.pendingControlConnectionSockets.size} was the winner`);
                    //clean up all remaining pending sockets
                    for (const pendingSocket of this.pendingControlConnectionSockets) {
                        pendingSocket.removeAllListeners();
                        //cleanup and destroy all other sockets
                        if (pendingSocket !== socket) {
                            pendingSocket.end();
                            pendingSocket?.destroy();
                        }
                    }
                    this.pendingControlConnectionSockets.clear();
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
            this.writeToBufferLog('server-to-client', data);
            this.emit('data', data);
            //queue up processing the new data, chunk by chunk
            void this.bufferQueue.run(async () => {
                this.buffer = Buffer.concat([this.buffer, data]);
                while (this.buffer.length > 0 && await this.process()) {
                    //the loop condition is the actual work
                }
                return true;
            });
        });

        this.controlSocket.on('close', () => {
            this.logger.log('Control socket closed');
            this.controlSocketClosed.tryResolve();
            //destroy the control socket since it just closed on us...
            this.controlSocket?.destroy?.();
            this.controlSocket = undefined;
            void this.shutdown('app-exit');
        });

        // Don't forget to catch error, for your own sake.
        this.controlSocket.once('error', (error) => {
            //the Roku closed the connection for some unknown reason...
            this.logger.error(`error on control port`, error);
            //destroy the control socket since it errored
            this.controlSocket?.destroy?.();
            this.controlSocket = undefined;
            void this.shutdown('close');
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

    /**
     * Write a specific buffer log entry to the logger, which, when file logging is enabled
     * can be extracted and processed through the DebugProtocolClientReplaySession
     */
    private writeToBufferLog(type: 'server-to-client' | 'client-to-server' | 'io', buffer: Buffer) {
        let obj = {
            type: type,
            timestamp: new Date().toISOString(),
            buffer: buffer.toJSON()
        };
        if (type === 'io') {
            (obj as any).text = buffer.toString();
        }
        this.logger.log('[[bufferLog]]:', JSON.stringify(obj));
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

    /**
     * Send the "exit channel" command, which will tell the debug session to immediately quit
     */
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
        const response = await this.processVariablesRequest(
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

        //if there was an issue, build a "fake" variables response for several known situationsm or throw nicer errors
        if (util.hasNonNullishProperty(response?.data.errorData)) {
            let variable = {
                value: null,
                isContainer: false,
                isConst: false,
                refCount: 0,
                childCount: 0
            } as Variable;
            const simulatedResponse = VariablesResponse.fromJson({
                ...response.data,
                variables: [variable]
            });

            let parentVarType: VariableType;
            let parentVarTypeText: string;
            const loadParentVarInfo = async (index: number) => {
                //fetch the variable one level back from the bad one to get its type
                const parentVar = await this.getVariables(
                    variablePathEntries.slice(0, index),
                    stackFrameIndex,
                    threadIndex
                );
                parentVarType = parentVar?.data?.variables?.[0]?.type;
                parentVarTypeText = parentVarType;
                //convert `roSGNode; Node` to `roSGNode (Node)`
                if (parentVarType === VariableType.SubtypedObject) {
                    const chunks = parentVar?.data?.variables?.[0]?.value?.toString().split(';').map(x => x.trim());
                    parentVarTypeText = `${chunks[0]} (${chunks[1]})`;
                }
            };

            if (!util.isNullish(response.data.errorData.missingKeyIndex)) {
                const { missingKeyIndex } = response.data.errorData;
                //leftmost var is uninitialized, and we tried to read it
                //ex: variablePathEntries = [`notThere`]
                if (variablePathEntries.length === 1 && missingKeyIndex === 0) {
                    variable.name = variablePathEntries[0];
                    variable.type = VariableType.Uninitialized;
                    return simulatedResponse;
                }

                //leftmost var was uninitialized, and tried to read a prop on it
                //ex: variablePathEntries = ["notThere", "definitelyNotThere"]
                if (missingKeyIndex === 0 && variablePathEntries.length > 1) {
                    throw new Error(`Cannot read '${variablePathEntries[missingKeyIndex + 1]}' on type 'Uninitialized'`);
                }

                if (variablePathEntries.length > 1 && missingKeyIndex > 0) {
                    await loadParentVarInfo(missingKeyIndex);

                    // prop at the end of Node or AA doesn't exist. Treat like `invalid`.
                    // ex: variablePathEntries = ['there', 'notThere']
                    if (
                        missingKeyIndex === variablePathEntries.length - 1 &&
                        [VariableType.AssociativeArray, VariableType.SubtypedObject].includes(parentVarType)
                    ) {
                        variable.name = variablePathEntries[variablePathEntries.length - 1];
                        variable.type = VariableType.Invalid;
                        variable.value = 'Invalid (not defined)';
                        return simulatedResponse;
                    }
                }
                //prop in the middle is missing, tried reading a prop on it
                // ex: variablePathEntries = ["there", "notThere", "definitelyNotThere"]
                throw new Error(`Cannot read '${variablePathEntries[missingKeyIndex]}'${parentVarType ? ` on type '${parentVarTypeText}'` : ''}`);
            }

            //this flow is when the item at the index exists, but is set to literally `invalid` or is an unknown value
            if (!util.isNullish(response.data.errorData.invalidPathIndex)) {
                const { invalidPathIndex } = response.data.errorData;

                //leftmost var is literal `invalid`, tried to read it
                if (variablePathEntries.length === 1 && invalidPathIndex === 0) {
                    variable.name = variablePathEntries[variablePathEntries.length - 1];
                    variable.type = VariableType.Invalid;
                    return simulatedResponse;
                }

                if (
                    variablePathEntries.length > 1 &&
                    invalidPathIndex > 0 &&
                    //only do this logic if the invalid item is not the last item
                    invalidPathIndex < variablePathEntries.length - 1
                ) {
                    await loadParentVarInfo(invalidPathIndex + 1);

                    //leftmost var is set to literal `invalid`, tried to read prop
                    if (invalidPathIndex === 0 && variablePathEntries.length > 1) {
                        throw new Error(`Cannot read '${variablePathEntries[invalidPathIndex + 1]}' on type '${parentVarTypeText}'`);
                    }

                    // prop at the end doesn't exist. Treat like `invalid`.
                    // ex: variablePathEntries = ['there', 'notThere']
                    if (
                        invalidPathIndex === variablePathEntries.length - 1 &&
                        [VariableType.AssociativeArray, VariableType.SubtypedObject].includes(parentVarType)
                    ) {
                        variable.name = variablePathEntries[variablePathEntries.length - 1];
                        variable.type = VariableType.Invalid;
                        variable.value = 'Invalid (not defined)';
                        return simulatedResponse;
                    }
                }
                console.log('Bronley');
                //prop in the middle is missing, tried reading a prop on it
                // ex: variablePathEntries = ["there", "thereButSetToInvalid", "definitelyNotThere"]
                throw new Error(`Cannot read '${variablePathEntries[invalidPathIndex + 1]}'${parentVarType ? ` on type '${parentVarTypeText}'` : ''}`);
            }
        }
        return response;
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

            const useConditionalBreakpoints = (
                //does this protocol version support conditional breakpoints?
                this.supportsConditionalBreakpoints &&
                //is there at least one conditional breakpoint present?
                !!breakpoints.find(x => !!x?.conditionalExpression?.trim())
            );

            let response: AddBreakpointsResponse | AddConditionalBreakpointsResponse;
            if (useConditionalBreakpoints) {
                response = await this.sendRequest<AddBreakpointsResponse>(
                    AddConditionalBreakpointsRequest.fromJson(json)
                );
            } else {
                response = await this.sendRequest<AddBreakpointsResponse>(
                    AddBreakpointsRequest.fromJson(json)
                );
            }

            //if the device does not support breakpoint verification, then auto-mark all of these as verified
            if (!this.supportsBreakpointVerification) {
                this.emit('breakpoints-verified', {
                    breakpoints: response.data.breakpoints
                });
            }
            return response;
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
        //throw out null breakpoints
        request.data.breakpointIds = request.data.breakpointIds?.filter(x => typeof x === 'number') ?? [];

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

        return new Promise<T>((resolve, reject) => {
            let unsubscribe = this.on('response', (response) => {
                if (response.data.requestId === request.data.requestId) {
                    unsubscribe();
                    this.activeRequests.delete(request.data.requestId);
                    resolve(response as T);
                }
            });

            this.logEvent(request);
            if (this.controlSocket) {
                const buffer = request.toBuffer();
                this.writeToBufferLog('client-to-server', buffer);
                this.controlSocket.write(buffer);
                void this.plugins.emit('afterSendRequest', {
                    client: this,
                    request: request
                });
            } else {
                reject(
                    new Error(`Control socket was closed - Command: ${Command[request.data.command]}`)
                );
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

    /**
     * A counter to help give a unique id to each update (mostly just for logging purposes)
     */
    private updateSequence = 1;

    private logEvent(event: ProtocolRequest | ProtocolResponse | ProtocolUpdate) {
        const [, eventName, eventType] = /(.+?)((?:v\d+_?\d*)?(?:request|response|update))/ig.exec(event?.constructor.name) ?? [];
        if (isProtocolRequest(event)) {
            this.logger.log(`${eventName} ${event.data.requestId} (${eventType})`, event, `(${event?.constructor.name})`);
        } else if (isProtocolUpdate(event)) {
            this.logger.log(`${eventName} ${this.updateSequence++} (${eventType})`, event, `(${event?.constructor.name})`);
        } else {
            if (event.data.errorCode === ErrorCode.OK) {
                this.logger.log(`${eventName} ${event.data.requestId} (${eventType})`, event, `(${event?.constructor.name})`);
            } else {
                this.logger.log(`[error] ${eventName} ${event.data.requestId} (${eventType})`, event, `(${event?.constructor.name})`);
            }
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
                responseOrUpdate = await this.getResponseOrUpdate(this.buffer);
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

            //we have a valid event. Remove this data from the buffer
            this.buffer = this.buffer.slice(responseOrUpdate.readOffset);

            if (responseOrUpdate.data.errorCode !== ErrorCode.OK) {
                this.logEvent(responseOrUpdate);
            }

            //we got a result
            if (responseOrUpdate) {
                //emit the corresponding event
                if (isProtocolUpdate(responseOrUpdate)) {
                    this.logEvent(responseOrUpdate);
                    this.emit('update', responseOrUpdate);
                    await this.plugins.emit('onUpdate', {
                        client: this,
                        update: responseOrUpdate
                    });
                } else {
                    this.logEvent(responseOrUpdate);
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
    public async getResponseOrUpdate(buffer: Buffer): Promise<ProtocolResponse | ProtocolUpdate> {
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
                await this.verifyHandshake(handshake);
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
                let compileErrorUpdate = CompileErrorUpdate.fromBuffer(buffer);
                if (compileErrorUpdate?.data?.errorMessage !== '') {
                    this.emit('compile-error', compileErrorUpdate);
                }
                return compileErrorUpdate;
            case UpdateType.BreakpointVerified:
                let response = BreakpointVerifiedUpdate.fromBuffer(buffer);
                if (response?.data?.breakpoints?.length > 0) {
                    this.emit('breakpoints-verified', response.data);
                }
                return response;
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
    private async verifyHandshake(response: HandshakeResponse | HandshakeV3Response): Promise<boolean> {
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
                await this.shutdown('close');
                handshakeVerified = false;
            }

            this.emit('handshake-verified', handshakeVerified);
            return handshakeVerified;
        } else {
            this.logger.log('Closing connection due to bad debugger magic', response.data.magic);
            this.emit('handshake-verified', false);
            await this.shutdown('close');
            return false;
        }
    }

    /**
     * When the debugger emits the IOPortOpenedUpdate, we need to immediately connect to the IO port to start receiving that data
     */
    private connectToIoPort(update: IOPortOpenedUpdate) {
        if (update.success) {
            // Create a new TCP client.
            this.ioSocket = new Net.Socket({
                allowHalfOpen: false
            });
            // Send a connection request to the server.
            this.logger.log(`Connect to IO Port ${this.options.host}:${update.data.port}`);

            //sometimes the server shuts down before we had a chance to connect, so recover more gracefully
            try {
                this.ioSocket.connect({
                    port: update.data.port,
                    host: this.options.host
                }, () => {
                    // If there is no error, the server has accepted the request
                    this.logger.log('TCP connection established with the IO Port.');
                    this.connectedToIoPort = true;

                    let lastPartialLine = '';
                    this.ioSocket.on('data', (buffer) => {
                        this.writeToBufferLog('io', buffer);
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

                    this.ioSocket.on('close', () => {
                        this.logger.log('IO socket closed');
                        this.ioSocketClosed.tryResolve();
                    });

                    // Don't forget to catch error, for your own sake.
                    this.ioSocket.once('error', (err) => {
                        this.ioSocket.end();
                        this.logger.error(err);
                    });
                });
                return true;
            } catch (e) {
                this.logger.error(`Failed to connect to IO socket at ${this.options.host}:${update.data.port}`, e);
                void this.shutdown('app-exit');
            }
        }
        return false;
    }

    /**
     * Destroy this instance, shutting down any sockets or other long-running items and cleaning up.
     * @param immediate if true, all sockets are immediately closed and do not gracefully shut down
     */
    public async destroy(immediate = false) {
        await this.shutdown('close', immediate);
    }

    private shutdownPromise: Promise<void>;
    private async shutdown(eventName: 'app-exit' | 'close', immediate = false) {
        await this.emit(eventName);
        if (this.shutdownPromise === undefined) {
            this.logger.log('[shutdown] shutting down');
            this.shutdownPromise = this._shutdown(immediate);
        } else {
            this.logger.log(`[shutdown] Tried to call .shutdown() again. Returning the same promise`);
        }
        return this.shutdownPromise;
    }

    private async _shutdown(immediate = false) {
        this.cancelControlConnectInterval?.();
        for (const pendingSocket of this.pendingControlConnectionSockets) {
            pendingSocket.removeAllListeners();
            //cleanup and destroy all other sockets
            if (pendingSocket !== this.controlSocket) {
                pendingSocket.end();
                pendingSocket?.destroy();
            }
        }

        let exitChannelTimeout = this.options?.exitChannelTimeout ?? 30_000;
        let shutdownTimeMax = this.options?.shutdownTimeout ?? 10_000;
        //if immediate is true, this is an instant shutdown force. don't wait for anything
        if (immediate) {
            exitChannelTimeout = 0;
            shutdownTimeMax = 0;
        }

        //tell the device to exit the channel (only if the device is still listening...)
        if (this.controlSocket) {
            try {
                //ask the device to terminate the debug session. We have to wait for this to come back.
                //The device might be running unstoppable code, so this might take a while. Wait for the device to send back
                //the response before we continue with the teardown process
                await Promise.race([
                    immediate
                        ? Promise.resolve(null)
                        : this.exitChannel().finally(() => this.logger.log('exit channel completed')),
                    //if the exit channel request took this long to finish, something's terribly wrong
                    util.sleep(exitChannelTimeout)
                ]);
            } finally { }
        }

        await Promise.all([
            this.destroyControlSocket(shutdownTimeMax),
            this.destroyIOSocket(shutdownTimeMax, immediate)
        ]);
        this.emitter?.removeAllListeners();
        this.buffer = Buffer.alloc(0);
        this.bufferQueue.destroy();
    }

    private isDestroyingControlSocket = false;

    private async destroyControlSocket(timeout: number) {
        if (this.controlSocket && !this.isDestroyingControlSocket) {
            this.isDestroyingControlSocket = true;

            //wait for the controlSocket to be closed
            await Promise.race([
                this.controlSocketClosed.promise,
                util.sleep(timeout)
            ]);

            this.logger.log('[destroy] controlSocket is: ', this.controlSocketClosed.isResolved ? 'closed' : 'not closed');

            //destroy the controlSocket
            this.controlSocket.removeAllListeners();
            this.controlSocket.destroy();
            this.controlSocket = undefined;
            this.isDestroyingControlSocket = false;
        }
    }

    private isDestroyingIOSocket = false;

    /**
     * @param immediate if true, force close immediately instead of waiting for it to settle
     */
    private async destroyIOSocket(timeout: number, immediate = false) {
        if (this.ioSocket && !this.isDestroyingIOSocket) {
            this.isDestroyingIOSocket = true;
            //wait for the ioSocket to be closed
            await Promise.race([
                this.ioSocketClosed.promise.then(() => this.logger.log('IO socket closed')),
                util.sleep(timeout)
            ]);

            //if the io socket is not closed, wait for it to at least settle
            if (!this.ioSocketClosed.isCompleted && !immediate) {
                await new Promise<void>((resolve) => {
                    const callback = debounce(() => {
                        resolve();
                    }, 250);
                    //trigger the current callback once.
                    callback();
                    this.ioSocket?.on('drain', callback as () => void);
                });
            }

            this.logger.log('[destroy] ioSocket is: ', this.ioSocketClosed.isResolved ? 'closed' : 'not closed');

            //destroy the ioSocket
            this.ioSocket?.removeAllListeners?.();
            this.ioSocket?.destroy?.();
            this.ioSocket = undefined;
            this.isDestroyingIOSocket = false;
        }
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

    /**
     * The number of milliseconds that the client should wait during a shutdown request before forcefully terminating the sockets
     */
    shutdownTimeout?: number;

    /**
     * The max time the client will wait for the `exit channel` response before forcefully terminating the sockets
     */
    exitChannelTimeout?: number;
}

/**
 * Is the event a ProtocolRequest
 */
export function isProtocolRequest(event: ProtocolRequest | ProtocolResponse | ProtocolUpdate): event is ProtocolRequest {
    return event?.constructor?.name.endsWith('Request') && event?.data?.requestId > 0;
}

/**
 * Is the event a ProtocolResponse
 */
export function isProtocolResponse(event: ProtocolRequest | ProtocolResponse | ProtocolUpdate): event is ProtocolResponse {
    return event?.constructor?.name.endsWith('Response') && event?.data?.requestId !== 0;
}

/**
 * Is the event a ProtocolUpdate update
 */
export function isProtocolUpdate(event: ProtocolRequest | ProtocolResponse | ProtocolUpdate): event is ProtocolUpdate {
    return event?.constructor?.name.endsWith('Update') && event?.data?.requestId === 0;
}

export interface BreakpointsVerifiedEvent {
    breakpoints: VerifiedBreakpoint[];
}
