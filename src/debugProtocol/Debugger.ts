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
import { PROTOCOL_ERROR_CODES, COMMANDS, STEP_TYPE, STOP_REASONS } from './Constants';
import { SmartBuffer } from 'smart-buffer';
import { logger } from '../logging';
import { ERROR_CODES, UPDATE_TYPES } from '..';
import { ExecuteResponseV3 } from './responses/ExecuteResponseV3';
import { ListBreakpointsResponse } from './responses/ListBreakpointsResponse';
import { AddBreakpointsResponse } from './responses/AddBreakpointsResponse';
import { RemoveBreakpointsResponse } from './responses/RemoveBreakpointsResponse';

export class Debugger {

    private logger = logger.createLogger(`[debugProtocol/${Debugger.name}]`);

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
            stopOnEntry: false,
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
    private firstRunContinueFired = false;
    private stopped = false;
    private totalRequests = 0;
    private activeRequests = {};
    private options: ConstructorOptions;

    /**
     * Get a promise that resolves after an event occurs exactly once
     */
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
    public on(eventName: 'data' | 'runtime-error' | 'suspend', handler: (data: any) => void);
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

    private emit(
        /* eslint-disable */
        eventName:
            'app-exit' |
            'cannot-continue' |
            'close' |
            'connected' |
            'data' |
            'handshake-verified' |
            'io-output' |
            'protocol-version' |
            'runtime-error' |
            'start' |
            'suspend',
        /* eslint-disable */
        data?
    ) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            if (this.emitter) {
                this.emitter.emit(eventName, data);
            }
        }, 0);
    }

    public async connect(): Promise<boolean> {
        this.logger.log('connect', this.options);
        const debugSetupEnd = 'total socket debugger setup time';
        console.time(debugSetupEnd);

        // Create a new TCP client.`
        this.controllerClient = new Net.Socket();
        // Send a connection request to the server.

        this.controllerClient.connect({ port: this.options.controllerPort, host: this.options.host }, () => {
            // If there is no error, the server has accepted the request and created a new
            // socket dedicated to us.
            this.logger.log('TCP connection established with the server.');

            // The client can also receive data from the server by reading from its socket.
            // The client can now send data to the server by writing to its socket.
            let buffer = new SmartBuffer({ size: Buffer.byteLength(Debugger.DEBUGGER_MAGIC) + 1 }).writeStringNT(Debugger.DEBUGGER_MAGIC).toBuffer();
            this.logger.log('Sending magic to server');
            this.controllerClient.write(buffer);
        });

        this.controllerClient.on('data', (buffer) => {
            if (this.unhandledData) {
                this.unhandledData = Buffer.concat([this.unhandledData, buffer]);
            } else {
                this.unhandledData = buffer;
            }

            this.parseUnhandledData(this.unhandledData);
        });

        this.controllerClient.on('end', () => {
            this.logger.log('TCP connection closed');
            this.shutdown('app-exit');
        });

        // Don't forget to catch error, for your own sake.
        this.controllerClient.once('error', (error) => {
            console.error(`TCP connection error`, error);
            this.shutdown('close');
        });

        let connectPromise: Promise<boolean> = new Promise((resolve, reject) => {
            let disconnect = this.on('connected', (connected) => {
                disconnect();
                console.timeEnd(debugSetupEnd);
                if (connected) {
                    resolve(connected);
                } else {
                    reject(connected);
                }
            });
        });

        return connectPromise;
    }

    public async continue() {
        let result;
        if (this.stopped) {
            this.stopped = false;
            result = this.makeRequest<ProtocolEvent>(new SmartBuffer({ size: 12 }), COMMANDS.CONTINUE);
        }
        return result;
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
                for (let i = 0; i < result.threadsCount; i++) {
                    let thread = result.threads[i];
                    if (thread.isPrimary) {
                        this.primaryThread = i;
                        break;
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

    public async getVariables(variablePathEntries: Array<string> = [], getChildKeys = true, stackFrameIndex: number = this.stackFrameIndex, threadIndex: number = this.primaryThread) {
        if (this.stopped && threadIndex > -1) {
            let buffer = new SmartBuffer({ size: 17 });
            buffer.writeUInt8(getChildKeys ? 1 : 0); // variable_request_flags
            buffer.writeUInt32LE(threadIndex); // thread_index
            buffer.writeUInt32LE(stackFrameIndex); // stack_frame_index
            buffer.writeUInt32LE(variablePathEntries.length); // variable_path_len
            variablePathEntries.forEach(variablePathEntry => {
                buffer.writeStringNT(variablePathEntry); // variable_path_entries - optional
            });
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

    public async addBreakpoints(breakpoints: BreakpointSpec[]): Promise<AddBreakpointsResponse> {
        if (breakpoints?.length > 0) {
            let buffer = new SmartBuffer();
            buffer.writeUInt32LE(breakpoints.length); // num_breakpoints - The number of breakpoints in the breakpoints array.
            breakpoints.forEach((breakpoint) => {
                buffer.writeStringNT(breakpoint.filePath); // file_path - The path of the source file where the breakpoint is to be inserted.
                buffer.writeUInt32LE(breakpoint.lineNumber); // line_number - The line number in the channel application code where the breakpoint is to be executed.
                buffer.writeUInt32LE(breakpoint.hitCount ?? 0); // ignore_count - The number of times to ignore the breakpoint condition before executing the breakpoint. This number is decremented each time the channel application reaches the breakpoint.
            });
            return this.makeRequest<AddBreakpointsResponse>(buffer, COMMANDS.ADD_BREAKPOINTS);
        }
        return new AddBreakpointsResponse(null);
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
            extraData: extraData
        };

        return new Promise<T>((resolve, reject) => {
            let unsubscribe = this.on('data', (data) => {
                if (data.requestId === requestId) {
                    unsubscribe();
                    resolve(data);
                }
            });

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

            this.logger.log('incoming data - ', `bytes: ${buffer.length}`, debuggerRequestResponse)
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
                    this.logger.log('Update Type:', UPDATE_TYPES[debuggerRequestResponse.updateType])
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
                            return false
                        case UPDATE_TYPES.UNDEF:
                            return this.checkResponse(new UndefinedResponse(slicedBuffer), buffer, packetLength);
                        default:
                            return this.checkResponse(new UndefinedResponse(slicedBuffer), buffer, packetLength);
                    }
                } else {
                    this.logger.log('Command Type:', COMMANDS[this.activeRequests[debuggerRequestResponse.requestId].commandType])
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
            if (!debuggerHandshake.success) {
                debuggerHandshake = new HandshakeResponse(buffer);
            }

            if (debuggerHandshake.success) {
                this.handshakeComplete = true;
                this.verifyHandshake(debuggerHandshake);
                this.removedProcessedBytes(debuggerHandshake, buffer);
                return true;
            }
        }

        return false;
    }

    private checkResponse(responseClass: { requestId: number, readOffset: number, success: boolean }, unhandledData: Buffer, packetLength = 0) {
        if (responseClass.success) {
            this.removedProcessedBytes(responseClass, unhandledData, packetLength);
            return true;
        } else if (packetLength > 0 && unhandledData.length >= packetLength) {
            this.removedProcessedBytes(responseClass, unhandledData, packetLength);
        }
        return false;
    }

    private removedProcessedBytes(responseHandler: { requestId: number, readOffset: number }, unhandledData: Buffer, packetLength = 0) {
        if (responseHandler.requestId > 0 && this.activeRequests[responseHandler.requestId]) {
            delete this.activeRequests[responseHandler.requestId];
        }

        this.emit('data', responseHandler);

        this.unhandledData = unhandledData.slice(packetLength ? packetLength : responseHandler.readOffset);
        console.log(this.unhandledData.length, responseHandler);
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
                this.logger.log('not tested');
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
                    this.logger.log(`Error: ${err}`);
                });

                this.emit('connected', true);
            });

            this.removedProcessedBytes(connectIoPortResponse, unhandledData, packetLength);
            return true;
        }
        return false
    }

    private async handleThreadsUpdate(update: UpdateThreadsResponse) {
        this.stopped = true;
        let stopReason = update.data.stopReason;
        let eventName: 'runtime-error' | 'suspend' = stopReason === STOP_REASONS.RUNTIME_ERROR ? 'runtime-error' : 'suspend';

        if (update.updateType === UPDATE_TYPES.ALL_THREADS_STOPPED) {
            if (!this.firstRunContinueFired && !this.options.stopOnEntry) {
                this.logger.log('Sending first run continue command');
                await this.continue();
                this.firstRunContinueFired = true;
            } else if (stopReason === STOP_REASONS.RUNTIME_ERROR || stopReason === STOP_REASONS.BREAK || stopReason === STOP_REASONS.STOP_STATEMENT) {
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
}


export interface ConstructorOptions {
    /**
     * The host/ip address of the Roku
     */
    host: string;
    /**
     * If true, the application being debugged will stop on the first line of the program.
     */
    stopOnEntry?: boolean;
    /**
     * The port number used to send all debugger commands. This is static/unchanging for Roku devices,
     * but is configurable here to support unit testing or alternate runtimes (i.e. https://www.npmjs.com/package/brs)
     */
    controllerPort?: number;
}
