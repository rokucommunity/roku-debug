import { DebugProtocolClient } from './client/DebugProtocolClient';
import { defer, util } from '../util';
import * as portfinder from 'portfinder';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from './events/ProtocolEvent';
import { DebugProtocolServer } from './server/DebugProtocolServer';
import * as Net from 'net';
import { ActionQueue } from '../managers/ActionQueue';
import { IOPortOpenedUpdate, isIOPortOpenedUpdate } from './events/updates/IOPortOpenedUpdate';

export class DebugProtocolClientReplaySession {
    constructor(options: {
        bufferLog: string;
    }) {
        this.parseBufferLog(options?.bufferLog);
    }

    /**
     * A dumb tcp server that will simply spit back the server buffer data when needed
     */
    private server: Net.Socket;

    private client: DebugProtocolClient;

    private entries: Array<BufferLogEntry>;

    private parseBufferLog(bufferLog: string) {
        this.entries = bufferLog
            .split(/\r?\n/g)
            .map(x => x.trim())
            .filter(x => !!x)
            .map(line => {
                const entry = JSON.parse(line);
                entry.timestamp = new Date(entry.timestamp as string);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                entry.buffer = Buffer.from(entry.buffer);
                return entry;
            });
    }

    public result: Array<ProtocolRequest | ProtocolResponse | ProtocolUpdate> = [];
    private finished = defer();
    private controlPort: number;
    private ioPort: number;

    public async run() {
        this.controlPort = await portfinder.getPortPromise({ port: 8000, stopPort: 8999 });
        this.ioPort = await portfinder.getPortPromise({ port: 9000, stopPort: 9999 });

        await this.createServer(this.controlPort);

        this.createClient(this.controlPort);

        //connect, but don't send the handshake. That'll be send through our first server-to-client entry (hopefully)
        await this.client.connect(false);

        void this.clientProcess();
        await this.finished.promise;
    }

    private createClient(controlPort: number) {
        this.client = new DebugProtocolClient({
            controlPort: controlPort,
            host: 'localhost'
        });

        //store the responses in the result
        this.client.on('response', (response) => {
            this.result.push(response);
        });
        this.client.on('update', (update) => {
            this.result.push(update);
        });

        //anytime the client receives buffer data, we should try and process it
        this.client.on('data', (data) => {
            this.clientSync.pushActual(data);
            void this.clientProcess();
        });

        this.client.plugins.add({
            beforeHandleUpdate: async (event) => {
                if (isIOPortOpenedUpdate(event.update)) {
                    //spin up an IO port before finishing this update
                    await this.openIOPort();

                    const update = IOPortOpenedUpdate.fromJson(event.update.data);
                    update.data.port = this.ioPort;
                    //if we get an IO update, change the port and host to the local stuff (for testing purposes)
                    event.update = update;
                }
            }
        });
    }

    private openIOPort() {
        console.log(`Spinning up mock IO socket on port ${this.ioPort}`);
        return new Promise<void>((resolve) => {
            const server = new Net.Server({});

            //whenever a client makes a connection
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            server.on('connection', (client: Net.Socket) => {
                this.server = client;
                //anytime we receive incoming data from the client
                client.on('data', (data) => {
                    //TODO send IO data
                });
            });
            server.listen({
                port: this.ioPort,
                hostName: 'localhost'
            }, () => {
                resolve();
            });
        });
    }

    private clientSync = new BufferSync();

    private clientActionQueue = new ActionQueue();

    private async clientProcess() {
        await this.clientActionQueue.run(async () => {
            let clientBuffer = Buffer.alloc(0);
            //build a single buffer of client data
            while (this.entries[0]?.type === 'client-to-server') {
                const entry = this.entries.shift();
                clientBuffer = Buffer.concat([clientBuffer, entry.buffer]);
            }
            //build and send requests
            while (clientBuffer.length > 0) {
                const request = DebugProtocolServer.getRequest(clientBuffer, true);
                //remove the processed bytes
                clientBuffer = clientBuffer.slice(request.readOffset);

                //store this client data for our mock server to recognize and track
                this.serverSync.pushExpected(request.toBuffer());

                //store the request in the result
                this.result.push(request);

                //send the request
                void this.client.processRequest(request);

                //wait small timeout before sending the next request
                await util.sleep(10);
            }
            this.finalizeIfDone();
            return true;
        });
    }

    private finalizeIfDone() {
        if (this.clientSync.areInSync && this.serverSync.areInSync && this.entries.length === 0) {
            this.finished.resolve();
        }
    }

    private createServer(controlPort: number) {
        return new Promise<void>((resolve) => {

            const server = new Net.Server({});
            //Roku only allows 1 connection, so we should too.
            server.maxConnections = 1;

            //whenever a client makes a connection
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            server.on('connection', (client: Net.Socket) => {
                this.server = client;
                //anytime we receive incoming data from the client
                client.on('data', (data) => {
                    void this.serverProcess(data);
                });
            });
            server.listen({
                port: controlPort,
                hostName: 'localhost'
            }, () => {
                resolve();
            });
        });
    }

    private serverActionQueue = new ActionQueue();

    private serverSync = new BufferSync();
    private async serverProcess(data: Buffer) {
        await this.serverActionQueue.run(async () => {
            this.serverSync.pushActual(data);
            if (this.serverSync.areInSync) {
                this.serverSync.clear();
                //send all the server messages, each delayed slightly to simulate the chunked buffer flushing that roku causes
                while (this.entries[0]?.type === 'server-to-client') {
                    const entry = this.entries.shift();
                    this.server.write(entry.buffer);
                    this.clientSync.pushExpected(entry.buffer);
                    await util.sleep(10);
                }
            }
            this.finalizeIfDone();
            return true;
        });
    }
}

class BufferSync {
    private expected = Buffer.alloc(0);
    public pushExpected(buffer: Buffer) {
        this.expected = Buffer.concat([this.expected, buffer]);
    }

    private actual = Buffer.alloc(0);
    public pushActual(buffer: Buffer) {
        this.actual = Buffer.concat([this.actual, buffer]);
    }

    /**
     * Are the two buffers in sync?
     */
    public get areInSync() {
        return JSON.stringify(this.expected) === JSON.stringify(this.actual);
    }

    public clear() {
        this.expected = Buffer.alloc(0);
        this.actual = Buffer.alloc(0);
    }
}

function bufferStartsWith(subject: Buffer, search: Buffer) {
    const subjectData = subject.toJSON().data;
    const searchData = search.toJSON().data;
    for (let i = 0; i < searchData.length; i++) {
        if (subjectData[i] !== searchData[i]) {
            return false;
        }
    }
    //if we made it to the end of the search, then the subject fully starts with search
    return true;
}

export interface BufferLogEntry {
    type: 'client-to-server' | 'server-to-client';
    timestamp: Date;
    buffer: Buffer;
}


