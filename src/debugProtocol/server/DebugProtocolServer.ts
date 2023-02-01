import { EventEmitter } from 'eventemitter3';
import * as Net from 'net';
import { ActionQueue } from '../../managers/ActionQueue';
import { Command, CommandCode } from '../Constants';
import type { ProtocolRequest, ProtocolResponse } from '../events/ProtocolEvent';
import { AddBreakpointsRequest } from '../events/requests/AddBreakpointsRequest';
import { AddConditionalBreakpointsRequest } from '../events/requests/AddConditionalBreakpointsRequest';
import { ContinueRequest } from '../events/requests/ContinueRequest';
import { ExecuteRequest } from '../events/requests/ExecuteRequest';
import { ExitChannelRequest } from '../events/requests/ExitChannelRequest';
import { HandshakeRequest } from '../events/requests/HandshakeRequest';
import { ListBreakpointsRequest } from '../events/requests/ListBreakpointsRequest';
import { RemoveBreakpointsRequest } from '../events/requests/RemoveBreakpointsRequest';
import { StackTraceRequest } from '../events/requests/StackTraceRequest';
import { StepRequest } from '../events/requests/StepRequest';
import { StopRequest } from '../events/requests/StopRequest';
import { ThreadsRequest } from '../events/requests/ThreadsRequest';
import { VariablesRequest } from '../events/requests/VariablesRequest';
import { HandshakeResponse } from '../events/responses/HandshakeResponse';
import { HandshakeV3Response } from '../events/responses/HandshakeV3Response';
import PluginInterface from './PluginInterface';
import type { ProtocolPlugin } from './ProtocolPlugin';
import { logger } from '../../logging';
import * as portfinder from 'portfinder';
import { defer } from '../../util';
import { protocolUtil } from '../ProtocolUtil';
import { SmartBuffer } from 'smart-buffer';

export const DEBUGGER_MAGIC = 'bsdebug';

/**
 * A class that emulates the way a Roku's DebugProtocol debug session/server works. This is mostly useful for unit testing,
 * but might eventually be helpful for an off-device emulator as well
 */
export class DebugProtocolServer {
    constructor(
        public options?: DebugProtocolServerOptions
    ) {

    }

    private logger = logger.createLogger(`[${DebugProtocolServer.name}]`);

    /**
     * Indicates whether the client has sent the magic string to kick off the debug session.
     */
    private isHandshakeComplete = false;

    private buffer = Buffer.alloc(0);

    /**
     * The server
     */
    private server: Net.Server;
    /**
     * Once a client connects, this is a reference to that client
     */
    private client: Net.Socket;

    /**
     * A collection of plugins that can interact with the server at lifecycle points
     */
    public plugins = new PluginInterface<ProtocolPlugin>();

    /**
     * A queue for processing the incoming buffer, every transmission at a time
     */
    private bufferQueue = new ActionQueue();

    public get controlPort() {
        return this.options.controlPort ?? this._port;
    }
    private _port: number;

    /**
     * Run the server. This opens a socket and listens for a connection.
     * The promise resolves when the server has started listening. It does NOT wait for a client to connect
     */
    public async start() {
        const deferred = defer();
        try {
            this.server = new Net.Server({});
            //Roku only allows 1 connection, so we should too.
            this.server.maxConnections = 1;

            //whenever a client makes a connection
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.server.on('connection', async (socket: Net.Socket) => {
                const event = await this.plugins.emit('onClientConnected', {
                    server: this,
                    client: socket
                });
                this.client = event.client;

                //anytime we receive incoming data from the client
                this.client.on('data', (data) => {
                    //queue up processing the new data, chunk by chunk
                    void this.bufferQueue.run(async () => {
                        this.buffer = Buffer.concat([this.buffer, data]);
                        while (this.buffer.length > 0 && await this.process()) {
                            //the loop condition is the actual work
                        }
                        return true;
                    });
                });
            });
            this._port = this.controlPort ?? await portfinder.getPortPromise();
            this.server.listen({
                port: this.options.controlPort ?? 8081,
                hostName: this.options.host ?? '0.0.0.0'
            }, () => {
                void this.plugins.emit('onServerStart', { server: this });
                deferred.resolve();
            });
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    public async stop() {
        //close the client socket
        await new Promise<void>((resolve) => {
            this.client.end(resolve);
        }).catch(() => { });

        //now close the server
        return new Promise<void>((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Given a buffer, find the request that matches it
     */
    public static getRequest(buffer: Buffer, allowHandshake: boolean): ProtocolRequest {
        //when enabled, look at the start of the buffer for the exact DEBUGGER_MAGIC text. This is a boolean because
        //there could be cases where binary data looks similar to this structure, so the caller must opt-in to this logic
        if (allowHandshake && buffer.length >= 8 && protocolUtil.readStringNT(SmartBuffer.fromBuffer(buffer)) === DEBUGGER_MAGIC) {
            return HandshakeRequest.fromBuffer(buffer);
        }
        // if we don't have enough buffer data, skip this
        if (buffer.length < 12) {
            return;
        }
        //the client may only send commands to the server, so extract the command type from the known byte position
        const command = CommandCode[buffer.readUInt32LE(8)] as Command; // command_code
        switch (command) {
            case Command.AddBreakpoints:
                return AddBreakpointsRequest.fromBuffer(buffer);
            case Command.Stop:
                return StopRequest.fromBuffer(buffer);
            case Command.Continue:
                return ContinueRequest.fromBuffer(buffer);
            case Command.Threads:
                return ThreadsRequest.fromBuffer(buffer);
            case Command.StackTrace:
                return StackTraceRequest.fromBuffer(buffer);
            case Command.Variables:
                return VariablesRequest.fromBuffer(buffer);
            case Command.Step:
                return StepRequest.fromBuffer(buffer);
            case Command.ListBreakpoints:
                return ListBreakpointsRequest.fromBuffer(buffer);
            case Command.RemoveBreakpoints:
                return RemoveBreakpointsRequest.fromBuffer(buffer);
            case Command.Execute:
                return ExecuteRequest.fromBuffer(buffer);
            case Command.AddConditionalBreakpoints:
                return AddConditionalBreakpointsRequest.fromBuffer(buffer);
            case Command.ExitChannel:
                return ExitChannelRequest.fromBuffer(buffer);
        }
    }

    private getResponse(request: ProtocolRequest) {
        if (request instanceof HandshakeRequest) {
            return HandshakeV3Response.fromJson({
                magic: this.magic,
                protocolVersion: '3.1.0',
                //TODO update this to an actual date from the device
                revisionTimestamp: new Date(2022, 1, 1)
            });
        }
    }

    /**
     * Process a single request.
     * @returns true if successfully processed a request, and false if not
     */
    private async process() {
        try {
            this.logger.log('process() start', { buffer: this.buffer.toJSON() });

            //at this point, there is an active debug session. The plugin must provide us all the real-world data
            let { buffer, request } = await this.plugins.emit('provideRequest', {
                server: this,
                buffer: this.buffer,
                request: undefined
            });

            //we must build the request if the plugin didn't supply one (most plugins won't provide a request...)
            if (!request) {
                //if we haven't seen the handshake yet, look for the handshake first
                if (!this.isHandshakeComplete) {
                    request = HandshakeRequest.fromBuffer(buffer);
                } else {
                    request = DebugProtocolServer.getRequest(buffer, false);
                }
            }

            //if we couldn't construct a request this request, hard-fail
            if (!request || !request.success) {
                this.logger.error('process() invalid request', { request });
                throw new Error(`Unable to parse request: ${JSON.stringify(this.buffer.toJSON().data)}`);
            }

            this.logger.log('process() constructed request', { request });

            //trim the buffer now that the request has been processed
            this.buffer = buffer.slice(request.readOffset);

            this.logger.log('process() buffer sliced', { buffer: this.buffer.toJSON() });

            //now ask the plugin to provide a response for the given request
            let { response } = await this.plugins.emit('provideResponse', {
                server: this,
                request: request,
                response: undefined
            });


            //if the plugin didn't provide a response, we need to try our best to make one (we only support a few...plugins should provide most of them)
            if (!response) {
                response = this.getResponse(request);
            }

            if (!response) {
                this.logger.error('process() invalid response', { request, response });
                throw new Error(`Server was unable to provide a response for ${JSON.stringify(request.data)}`);
            }


            //if this is part of the handshake flow, the client should have sent a magic string to kick off the debugger. If it matches, set `isHandshakeComplete = true`
            if ((response instanceof HandshakeResponse || response instanceof HandshakeV3Response) && response.data.magic === this.magic) {
                this.isHandshakeComplete = true;
            }

            //send the response to the client. (TODO handle when the response is missing)
            await this.sendResponse(response);
            return true;
        } catch (e) {
            this.logger.error('process() error', e);
        }
        return false;
    }

    /**
     * Send a response from the server to the client. This involves writing the response buffer to the client socket
     */
    private async sendResponse(response: ProtocolResponse) {
        const event = await this.plugins.emit('beforeSendResponse', {
            server: this,
            response: response
        });

        this.logger.log('sendResponse()', { response });
        this.client.write(event.response.toBuffer());

        await this.plugins.emit('afterSendResponse', {
            server: this,
            response: event.response
        });
        return event.response;
    }

    /**
     * Send an update from the server to the client. This can be things like ALL_THREADS_STOPPED
     */
    public sendUpdate(update: ProtocolResponse) {
        return this.sendResponse(update);
    }

    /**
     * An event emitter used for all of the events this server emitts
     */
    private emitter = new EventEmitter();

    public on<T = { response: Response }>(eventName: 'before-send-response', callback: (event: T) => void);
    public on<T = { response: Response }>(eventName: 'after-send-response', callback: (event: T) => void);
    public on<T = { client: Net.Socket }>(eventName: 'client-connected', callback: (event: T) => void);
    public on<T = any>(eventName: string, callback: (data: T) => void)
    public on<T = any>(eventName: string, callback: (data: T) => void) {
        this.emitter.on(eventName, callback);
        return () => {
            this.emitter?.removeListener(eventName, callback);
        };
    }

    /**
     * Subscribe to an event exactly one time. This will fire the very next time an event happens,
     * and then immediately unsubscribe
     */
    public once<T>(eventName: string): Promise<T> {
        return new Promise<T>((resolve) => {
            const off = this.on<T>(eventName, (event) => {
                off();
                resolve(event);
            });
        });
    }

    public emit<T = { response: Response }>(eventName: 'before-send-response', event: T): T;
    public emit<T = { response: Response }>(eventName: 'after-send-response', event: T): T;
    public emit<T = { client: Net.Socket }>(eventName: 'client-connected', event: T): T;
    public emit<T>(eventName: string, event: any): T {
        this.emitter?.emit(eventName, event);
        return event;
    }

    /**
     * The magic string used to kick off the debug session.
     * @default "bsdebug"
     */
    private get magic() {
        return this.options.magic ?? DEBUGGER_MAGIC;
    }
}

export interface DebugProtocolServerOptions {
    /**
     * The magic that is sent as part of the handshake
     */
    magic?: string;
    /**
     * The port to use for the primary communication between this server and a client
     */
    controlPort?: number;
    /**
     * A specific host to listen on. If not specified, all hosts are used
     */
    host?: string;
}
