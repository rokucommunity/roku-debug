import * as Net from 'net';
import * as EventEmitter from 'events';
import * as semver from 'semver';
import {
    Response,
    StackTraceResponse,
    ThreadsResponse,
    UpdateThreadsResponse,
    UndefinedResponse,
    ConnectIOPortResponse,
    HandshakeResponse,
    VariableResponse
} from './responses';
import { PROTOCOL_ERROR_CODES, COMMANDS, STEP_TYPE } from './Constants';
import { SmartBuffer } from 'smart-buffer';
import { logger } from '../logging';

export class Debugger {

    private logger = logger.createLogger(`[debugProtocol/${Debugger.name}]`);

    public get isStopped(): boolean {
        return this.stopped;
    }

    public supportedVersionRange = '=2.0.0';

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
            this.logger
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
            result = this.makeRequest<Response>(new SmartBuffer({ size: 12 }), COMMANDS.CONTINUE);
        }
        return result;
    }

    public async pause() {
        if (!this.stopped) {
            return this.makeRequest<Response>(new SmartBuffer({ size: 12 }), COMMANDS.STOP);
        }
    }

    public async exitChannel() {
        return this.makeRequest<Response>(new SmartBuffer({ size: 12 }), COMMANDS.EXIT_CHANNEL);
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

    private async step(stepType: STEP_TYPE, threadId: number): Promise<Response> {
        let buffer = new SmartBuffer({ size: 17 });
        buffer.writeUInt32LE(threadId); // thread_index
        buffer.writeUInt8(stepType); // step_type
        if (this.stopped) {
            this.stopped = false;
            let stepResult: any = await this.makeRequest<Response>(buffer, COMMANDS.STEP);
            if (stepResult.errorCode === 'OK') {
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
        let result;
        if (this.stopped) {
            result = this.makeRequest<ThreadsResponse>(new SmartBuffer({ size: 12 }), COMMANDS.THREADS);
            if (result.errorCode === 'OK') {
                for (let i = 0; i < result.threadCount; i++) {
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
            let disconnect = this.on('data', (data) => {
                if (data.requestId === requestId) {
                    disconnect();
                    resolve(data);
                }
            });

            this.controllerClient.write(buffer.toBuffer());
        });
    }

    private parseUnhandledData(unhandledData: Buffer): boolean {
        if (this.handshakeComplete) {
            let debuggerRequestResponse = new Response(unhandledData);
            if (debuggerRequestResponse.success) {

                if (debuggerRequestResponse.requestId > this.totalRequests) {
                    return false;
                }

                if (debuggerRequestResponse.errorCode !== 'OK') {
                    console.error(debuggerRequestResponse.errorCode, debuggerRequestResponse);
                    this.removedProcessedBytes(debuggerRequestResponse, unhandledData);
                    return true;
                }

                let commandType = this.activeRequests[debuggerRequestResponse.requestId].commandType;
                if (commandType === COMMANDS.STOP || commandType === COMMANDS.CONTINUE || commandType === COMMANDS.STEP || commandType === COMMANDS.EXIT_CHANNEL) {
                    this.removedProcessedBytes(debuggerRequestResponse, unhandledData);
                    return true;
                }

                if (commandType === COMMANDS.VARIABLES) {
                    let debuggerVariableRequestResponse = new VariableResponse(unhandledData);
                    if (debuggerVariableRequestResponse.success) {
                        this.removedProcessedBytes(debuggerVariableRequestResponse, unhandledData);
                        return true;
                    }
                }

                if (commandType === COMMANDS.STACKTRACE) {
                    let debuggerStacktraceRequestResponse = new StackTraceResponse(unhandledData);
                    if (debuggerStacktraceRequestResponse.success) {
                        this.removedProcessedBytes(debuggerStacktraceRequestResponse, unhandledData);
                        return true;
                    }
                }

                if (commandType === COMMANDS.THREADS) {
                    let debuggerThreadsRequestResponse = new ThreadsResponse(unhandledData);
                    if (debuggerThreadsRequestResponse.success) {
                        this.removedProcessedBytes(debuggerThreadsRequestResponse, unhandledData);
                        return true;
                    }
                }
            }

            let debuggerUpdateThreads = new UpdateThreadsResponse(unhandledData);
            if (debuggerUpdateThreads.success) {
                this.handleThreadsUpdate(debuggerUpdateThreads);
                this.removedProcessedBytes(debuggerUpdateThreads, unhandledData);
                return true;
            }

            let debuggerUpdateUndefined = new UndefinedResponse(unhandledData);
            if (debuggerUpdateUndefined.success) {
                this.removedProcessedBytes(debuggerUpdateUndefined, unhandledData);
                return true;
            }

            if (!this.connectedToIoPort) {
                let debuggerUpdateConnectIoPort = new ConnectIOPortResponse(unhandledData);
                if (debuggerUpdateConnectIoPort.success) {
                    this.connectToIoPort(debuggerUpdateConnectIoPort);
                    this.removedProcessedBytes(debuggerUpdateConnectIoPort, unhandledData);
                    return true;
                }
            }

        } else {
            let debuggerHandshake = new HandshakeResponse(unhandledData);
            if (debuggerHandshake.success) {
                this.handshakeComplete = true;
                this.verifyHandshake(debuggerHandshake);
                this.removedProcessedBytes(debuggerHandshake, unhandledData);
                return true;
            }
        }

        return false;
    }

    private removedProcessedBytes(responseHandler, unhandledData: Buffer) {
        console.log(responseHandler);
        if (this.activeRequests[responseHandler.requestId]) {
            delete this.activeRequests[responseHandler.requestId];
        }

        this.emit('data', responseHandler);

        this.unhandledData = unhandledData.slice(responseHandler.readOffset);
        this.parseUnhandledData(this.unhandledData);
    }

    private verifyHandshake(debuggerHandshake: HandshakeResponse): boolean {
        const magicIsValid = (Debugger.DEBUGGER_MAGIC === debuggerHandshake.magic);
        if (magicIsValid) {
            this.logger.log('Magic is valid.');
            this.protocolVersion = [debuggerHandshake.majorVersion, debuggerHandshake.minorVersion, debuggerHandshake.patchVersion].join('.');
            this.logger.log('Protocol Version:', this.protocolVersion);
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
                    message: `Protocol Version ${this.protocolVersion} is not supported.\nIf you believe this is an error please open an issues at https://github.com/rokucommunity/roku-debug/issues`,
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

    private connectToIoPort(connectIoPortResponse: ConnectIOPortResponse) {
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
    }

    private async handleThreadsUpdate(update) {
        this.stopped = true;
        let stopReason = update.data.stopReason;
        let eventName: 'runtime-error' | 'suspend' = stopReason === 'RUNTIME_ERROR' ? 'runtime-error' : 'suspend';

        if (update.updateType === 'ALL_THREADS_STOPPED') {
            if (!this.firstRunContinueFired && !this.options.stopOnEntry) {
                this.logger.log('Sending first run continue command');
                await this.continue();
                this.firstRunContinueFired = true;
            } else if (stopReason === 'RUNTIME_ERROR' || stopReason === 'BREAK' || stopReason === 'STOP_STATEMENT') {
                this.primaryThread = update.data.primaryThreadIndex;
                this.stackFrameIndex = 0;
                this.emit(eventName, update);
            }
        } else if (stopReason === 'RUNTIME_ERROR' || stopReason === 'BREAK' || stopReason === 'STOP_STATEMENT') {
            this.primaryThread = update.data.threadIndex;
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
