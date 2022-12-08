import * as Net from 'net';
import * as EventEmitter from 'eventemitter3';
import * as semver from 'semver';
import type {
    ThreadAttached,
    ThreadsStopped
} from './responses';
import {
    ConnectIOPortResponse,
    HandshakeResponse,
    HandshakeResponseV3,
    ProtocolEvent,
    ProtocolEventV3,
    StackTraceResponse,
    StackTraceResponseV3,
    ThreadsResponse,
    UndefinedResponse,
    UpdateThreadsResponse,
    VariableResponse
} from './responses';
import { PROTOCOL_ERROR_CODES, COMMANDS, STEP_TYPE, STOP_REASONS, VARIABLE_REQUEST_FLAGS, ERROR_CODES, UPDATE_TYPES } from './Constants';
import { SmartBuffer } from 'smart-buffer';
import { logger } from '../logging';
import { ExecuteResponseV3 } from './responses/ExecuteResponseV3';
import { ListBreakpointsResponse } from './responses/ListBreakpointsResponse';
import { AddBreakpointsResponse } from './responses/AddBreakpointsResponse';
import { RemoveBreakpointsResponse } from './responses/RemoveBreakpointsResponse';
import { util } from '../util';
import { BreakpointErrorUpdateResponse } from './responses/BreakpointErrorUpdateResponse';

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
    public handshakeComplete = false;
    public connectedToIoPort = false;
    public watchPacketLength = false;
    public protocolVersion: string;
    public primaryThread: number;
    public stackFrameIndex: number;

    private emitter = new EventEmitter();
    private controllerClient: Net.Socket;
    private ioClient: Net.Socket;
    private unhandledData: Buffer;
    private stopped = false;
    private totalRequests = 0;
    private activeRequests = {};
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

    /**
     * Get a promise that resolves after an event occurs exactly once
     */
    public once(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start'): Promise<void>;
    public once(eventName: 'data'): Promise<any>;
    public once(eventName: 'runtime-error' | 'suspend'): Promise<UpdateThreadsResponse>;
    public once(eventName: 'connected'): Promise<boolean>;
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

    /**
     * Subscribe to various events
     */
    public on(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'start', handler: () => void);
    public on(eventName: 'data', handler: (data: any) => void);
    public on(eventName: 'runtime-error' | 'suspend', handler: (data: UpdateThreadsResponse) => void);
    public on(eventName: 'connected', handler: (connected: boolean) => void);
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

    private emit(eventName: 'suspend' | 'runtime-error', data: UpdateThreadsResponse);
    private emit(eventName: 'app-exit' | 'cannot-continue' | 'close' | 'connected' | 'data' | 'handshake-verified' | 'io-output' | 'protocol-version' | 'start', data?);
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

        this.controllerClient.on('data', (buffer) => {
            if (this.unhandledData) {
                this.unhandledData = Buffer.concat([this.unhandledData, buffer]);
            } else {
                this.unhandledData = buffer;
            }

            this.logger.debug(`on('data'): incoming bytes`, buffer.length);
            const startBufferSize = this.unhandledData.length;

            this.parseUnhandledData(this.unhandledData);

            const endBufferSize = this.unhandledData?.length ?? 0;
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
        this.sendMagic();

        //wait for the handshake response from the device
        const isConnected = await this.once('connected');
        return isConnected;
    }

    private sendMagic() {
        let buffer = new SmartBuffer({ size: Buffer.byteLength(Debugger.DEBUGGER_MAGIC) + 1 }).writeStringNT(Debugger.DEBUGGER_MAGIC).toBuffer();
        this.logger.log('Sending magic to server');
        this.controllerClient.write(buffer);
    }

    public async continue() {
        if (this.stopped) {
            this.stopped = false;
            return this.makeRequest<ProtocolEvent>(new SmartBuffer({ size: 12 }), COMMANDS.CONTINUE);
        }
    }

    public async pause(force = false) {
        if (!this.stopped || force) {
            return this.makeRequest<ProtocolEvent>(new SmartBuffer({ size: 12 }), COMMANDS.STOP);
        }
    }

    public async exitChannel() {
        return this.makeRequest<ProtocolEvent>(new SmartBuffer({ size: 12 }), COMMANDS.EXIT_CHANNEL);
    }

    public async stepIn(threadId: number = this.primaryThread) {
        return this.step(STEP_TYPE.STEP_TYPE_LINE, threadId);
    }

    public async stepOver(threadId: number = this.primaryThread) {
        return this.step(STEP_TYPE.STEP_TYPE_OVER, threadId);
    }

    public async stepOut(threadId: number = this.primaryThread) {
        return this.step(STEP_TYPE.STEP_TYPE_OUT, threadId);
    }

    private async step(stepType: STEP_TYPE, threadId: number): Promise<ProtocolEvent> {
        this.logger.log('[step]', { stepType: STEP_TYPE[stepType], threadId, stopped: this.stopped });
        let buffer = new SmartBuffer({ size: 17 });
        buffer.writeUInt32LE(threadId); // thread_index
        buffer.writeUInt8(stepType); // step_type
        if (this.stopped) {
            this.stopped = false;
            let stepResult = await this.makeRequest<ProtocolEvent>(buffer, COMMANDS.STEP);
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
            let result = await this.makeRequest<ThreadsResponse>(new SmartBuffer({ size: 12 }), COMMANDS.THREADS);

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
            return this.makeRequest<StackTraceResponse>(buffer, COMMANDS.STACKTRACE);
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
            //starting in protocol v3.1.0, it supports marking certain path items as case-insensitive (i.e. parts of DottedGet expressions)
            const sendCaseInsensitiveData = semver.satisfies(this.protocolVersion, '>=3.1.0') && variablePathEntries.length > 0;
            let buffer = new SmartBuffer({ size: 17 });
            let flags = 0;
            if (getChildKeys) {
                // eslint-disable-next-line no-bitwise
                flags |= VARIABLE_REQUEST_FLAGS.GET_CHILD_KEYS;
            }
            if (sendCaseInsensitiveData) {
                // eslint-disable-next-line no-bitwise
                flags |= VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS;
            }
            buffer.writeUInt8(flags); // variable_request_flags
            buffer.writeUInt32LE(threadIndex); // thread_index
            buffer.writeUInt32LE(stackFrameIndex); // stack_frame_index
            buffer.writeUInt32LE(variablePathEntries.length); // variable_path_len
            variablePathEntries.forEach(entry => {
                if (entry.startsWith('"') && entry.endsWith('"')) {
                    //remove leading and trailing quotes
                    entry = entry.substring(1, entry.length - 1);
                }
                buffer.writeStringNT(entry); // variable_path_entries - optional
            });
            if (sendCaseInsensitiveData) {
                variablePathEntries.forEach(entry => {
                    buffer.writeUInt8(
                        //0 means case SENSITIVE lookup, 1 means case INsensitive lookup
                        entry.startsWith('"') ? 0 : 1
                    );
                });
            }
            return this.makeRequest<VariableResponse>(buffer, COMMANDS.VARIABLES, variablePathEntries);
        }
    }

    public async executeCommand(sourceCode: string, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.stopped && threadIndex > -1) {
            console.log(sourceCode);
            let buffer = new SmartBuffer({ size: 8 });
            buffer.writeUInt32LE(threadIndex); // thread_index
            buffer.writeUInt32LE(stackFrameIndex); // stack_frame_index
            buffer.writeStringNT(sourceCode); // source_code
            return this.makeRequest<ExecuteResponseV3>(buffer, COMMANDS.EXECUTE, sourceCode);
        }
    }

    public async addBreakpoints(breakpoints: Array<BreakpointSpec & { componentLibraryName: string }>): Promise<AddBreakpointsResponse> {
        const { enableComponentLibrarySpecificBreakpoints } = this;
        if (breakpoints?.length > 0) {

            const useConditionalBreakpoints = (
                //does this protocol version support conditional breakpoints?
                this.supportsConditionalBreakpoints &&
                //is there at least one conditional breakpoint present?
                !!breakpoints.find(x => !!x?.conditionalExpression?.trim())
            );

            let buffer = new SmartBuffer();
            //set the `FLAGS` value if supported
            if (useConditionalBreakpoints) {
                buffer.writeUInt32LE(0); // flags - Should always be passed as 0. Unused, reserved for future use.
            }
            buffer.writeUInt32LE(breakpoints.length); // num_breakpoints - The number of breakpoints in the breakpoints array.
            for (const breakpoint of breakpoints) {
                let { filePath } = breakpoint;
                //protocol >= v3.1.0 requires complib breakpoints have a special prefix
                if (enableComponentLibrarySpecificBreakpoints) {
                    if (breakpoint.componentLibraryName) {
                        filePath = filePath.replace(/^pkg:\//i, `lib:/${breakpoint.componentLibraryName}/`);
                    }
                }

                buffer.writeStringNT(filePath); // file_path - The path of the source file where the breakpoint is to be inserted.
                buffer.writeUInt32LE(breakpoint.lineNumber); // line_number - The line number in the channel application code where the breakpoint is to be executed.
                buffer.writeUInt32LE(breakpoint.hitCount ?? 0); // ignore_count - The number of times to ignore the breakpoint condition before executing the breakpoint. This number is decremented each time the channel application reaches the breakpoint.
                //if the protocol supports conditional breakpoints, add any present condition
                if (useConditionalBreakpoints) {
                    //There's a bug in 3.1 where empty conditional expressions would crash the breakpoints, so just default to `true` which always succeeds
                    buffer.writeStringNT(breakpoint.conditionalExpression ?? 'true'); // cond_expr - the condition that must evaluate to `true` in order to hit the breakpoint
                }
            }
            return this.makeRequest<AddBreakpointsResponse>(buffer,
                useConditionalBreakpoints ? COMMANDS.ADD_CONDITIONAL_BREAKPOINTS : COMMANDS.ADD_BREAKPOINTS
            );
        }
        const response = new AddBreakpointsResponse(null);
        response.success = true;
        response.errorCode = ERROR_CODES.OK;
        return response;
    }

    public async listBreakpoints(): Promise<ListBreakpointsResponse> {
        return this.makeRequest<ListBreakpointsResponse>(new SmartBuffer({ size: 12 }), COMMANDS.LIST_BREAKPOINTS);
    }

    public async removeBreakpoints(breakpointIds: number[]): Promise<RemoveBreakpointsResponse> {
        if (breakpointIds?.length > 0) {
            let buffer = new SmartBuffer();
            buffer.writeUInt32LE(breakpointIds.length); // num_breakpoints - The number of breakpoints in the breakpoints array.
            breakpointIds.forEach((breakpointId) => {
                buffer.writeUInt32LE(breakpointId); // breakpoint_ids - An array of breakpoint IDs representing the breakpoints to be removed.
            });
            return this.makeRequest<RemoveBreakpointsResponse>(buffer, COMMANDS.REMOVE_BREAKPOINTS);
        }
        return new RemoveBreakpointsResponse(null);
    }

    private async makeRequest<T>(buffer: SmartBuffer, command: COMMANDS, extraData?) {
        this.totalRequests++;
        let requestId = this.totalRequests;
        buffer.insertUInt32LE(command, 0); // command_code - An enum representing the debugging command being sent. See the COMMANDS enum
        buffer.insertUInt32LE(requestId, 0); // request_id - The ID of the debugger request (must be >=1). This ID is included in the debugger response.
        buffer.insertUInt32LE(buffer.writeOffset + 4, 0); // packet_length - The size of the packet to be sent.

        this.activeRequests[requestId] = {
            commandType: command,
            commandTypeText: COMMANDS[command],
            extraData: extraData
        };

        return new Promise<T>((resolve, reject) => {
            let unsubscribe = this.on('data', (data) => {
                if (data.requestId === requestId) {
                    unsubscribe();
                    resolve(data as T);
                }
            });

            this.logger.debug('makeRequest', `requestId=${requestId}`, this.activeRequests[requestId]);
            if (this.controllerClient) {
                this.controllerClient.write(buffer.toBuffer());
            } else {
                throw new Error(`Controller connection was closed - Command: ${COMMANDS[command]}`);
            }
        });
    }

    private parseUnhandledData(buffer: Buffer): boolean {
        if (buffer.length < 1) {
            // short circuit if the buffer is empty
            return false;
        }

        if (this.handshakeComplete) {
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
                    this.logger.log('Command Type:', COMMANDS[this.activeRequests[debuggerRequestResponse.requestId].commandType]);
                    switch (this.activeRequests[debuggerRequestResponse.requestId].commandType) {
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
        } else {
            let debuggerHandshake: HandshakeResponse | HandshakeResponseV3;
            debuggerHandshake = new HandshakeResponseV3(buffer);
            this.logger.log(`incoming bytes: ${buffer.length}`, debuggerHandshake);

            if (!debuggerHandshake.success) {
                debuggerHandshake = new HandshakeResponse(buffer);
            }

            if (debuggerHandshake.success) {
                this.handshakeComplete = true;
                this.verifyHandshake(debuggerHandshake);
                this.removedProcessedBytes(debuggerHandshake, buffer);
                //once the handshake is complete, we have successfully "connected"
                this.emit('connected', true);
                return true;
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

    private removedProcessedBytes(responseHandler: { requestId: number; readOffset: number }, unhandledData: Buffer, packetLength = 0) {
        const activeRequest = this.activeRequests[responseHandler.requestId];
        if (responseHandler.requestId > 0 && this.activeRequests[responseHandler.requestId]) {
            delete this.activeRequests[responseHandler.requestId];
        }

        this.emit('data', responseHandler);

        this.unhandledData = unhandledData.slice(packetLength ? packetLength : responseHandler.readOffset);
        this.logger.debug('[raw]', `requestId=${responseHandler?.requestId}`, activeRequest, (responseHandler as any)?.constructor?.name ?? '', responseHandler);
        this.parseUnhandledData(this.unhandledData);
    }

    private verifyHandshake(debuggerHandshake: HandshakeResponse): boolean {
        const magicIsValid = (Debugger.DEBUGGER_MAGIC === debuggerHandshake.magic);
        if (magicIsValid) {
            this.logger.log('Magic is valid.');
            this.protocolVersion = [debuggerHandshake.majorVersion, debuggerHandshake.minorVersion, debuggerHandshake.patchVersion].join('.');
            this.logger.log('Protocol Version:', this.protocolVersion);

            this.watchPacketLength = debuggerHandshake.watchPacketLength;

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
            this.logger.log('Closing connection due to bad debugger magic', debuggerHandshake.magic);
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
