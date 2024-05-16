import { DebugProtocolClient } from './client/DebugProtocolClient';
import { defer, util } from '../util';
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

    private disposables = Array<() => void>();

    /**
     * A dumb tcp server that will simply spit back the server buffer data when needed
     */
    private server: Net.Socket;

    private ioSocket: Net.Socket;

    private client: DebugProtocolClient;

    private entryIndex = 0;
    private entries: Array<BufferLogEntry>;

    private peekEntry() {
        this.flushIO();
        return this.entries[this.entryIndex];
    }
    private advanceEntry() {
        this.flushIO();
        return this.entries[this.entryIndex++];
    }

    private flushIO() {
        while (this.entries[this.entryIndex]?.type === 'io') {
            const entry = this.entries[this.entryIndex++];
            this.ioSocket.write(entry.buffer);
        }
    }

    private parseBufferLog(bufferLog: string) {
        this.entries = bufferLog
            .split(/\r?\n/g)
            //only keep lines that include the `[[bufferLog]]` magic text
            .filter(x => x.includes('[[bufferLog]]'))
            //remove leading text, leaving only the raw bufferLog entry
            .map(x => x.replace(/.*?\[\[bufferLog\]\]:/, '').trim())
            .filter(x => !!x)
            .map(line => {
                const entry = JSON.parse(line);
                entry.timestamp = new Date(entry.timestamp as string);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                entry.buffer = Buffer.from(entry.buffer);
                return entry;
            });
        return this.entries;
    }

    public result: Array<ProtocolRequest | ProtocolResponse | ProtocolUpdate> = [];
    private finished = defer();
    private controlPort: number;
    private ioPort: number;

    public async run() {
        this.controlPort = await util.getPort();
        this.ioPort = await util.getPort();

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
            void this.clientProcess();
        });
        this.client.on('update', (update) => {
            this.result.push(update);
            void this.clientProcess();
        });

        this.client.on('io-output', (data) => {
            console.log(data);
            void this.clientProcess();
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

        //stuff to run when the session is disposed
        this.disposables.push(() => {
            void this.client.destroy();
        });
    }

    private openIOPort() {
        console.log(`Spinning up mock IO socket on port ${this.ioPort}`);
        return new Promise<void>((resolve) => {
            const server = new Net.Server({});

            //whenever a client makes a connection
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            server.on('connection', (client: Net.Socket) => {
                this.ioSocket = client;
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

            //stuff to run when the session is disposed
            this.disposables.push(() => {
                server.close();
            });
            this.disposables.push(() => {
                this.ioSocket?.destroy();
            });
        });
    }

    private clientSync = new BufferSync();

    private clientActionQueue = new ActionQueue();

    private async clientProcess() {
        await this.clientActionQueue.run(async () => {
            //build a single buffer of client data
            while (this.peekEntry()?.type === 'client-to-server') {
                //make sure it's been enough time since the last entry
                await this.sleepForEntryGap();
                const entry = this.advanceEntry();
                const request = DebugProtocolServer.getRequest(entry.buffer, true);

                //store this client data for our mock server to recognize and track
                this.serverSync.pushExpected(request.toBuffer());

                //store the request in the result
                this.result.push(request);

                //send the request
                void this.client.processRequest(request);

            }
            this.finalizeIfDone();
            return true;
        });
    }

    private finalizeIfDone() {
        if (this.clientSync.areInSync && this.serverSync.areInSync && this.entryIndex >= this.entries.length) {
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
                    console.log('server got:', JSON.stringify(data.toJSON().data));
                    void this.serverProcess(data);
                });
            });
            server.listen({
                port: controlPort,
                hostName: 'localhost'
            }, () => {
                resolve();
            });

            //stuff to run when the session is disposed
            this.disposables.push(() => {
                server.close();
            });
            this.disposables.push(() => {
                void this.client?.destroy();
            });
        });
    }

    private serverActionQueue = new ActionQueue();

    private serverSync = new BufferSync();
    private serverProcessIdx = 0;
    private async serverProcess(data: Buffer) {
        let serverProcesIdx = this.serverProcessIdx++;
        await this.serverActionQueue.run(async () => {
            try {
                console.log(serverProcesIdx);
                this.serverSync.pushActual(data);
                if (this.serverSync.areInSync) {
                    this.serverSync.clear();
                    //send all the server messages, each delayed slightly to simulate the chunked buffer flushing that roku causes
                    while (this.peekEntry()?.type === 'server-to-client') {
                        //make sure enough time has passed since the last entry
                        await this.sleepForEntryGap();
                        const entry = this.advanceEntry();
                        this.server.write(entry.buffer);
                        this.clientSync.pushExpected(entry.buffer);
                    }
                }
                this.finalizeIfDone();
            } catch (e) {
                console.error('serverProcess failed to handle buffer', e);
            }
            return true;
        });
    }

    /**
     * Sleep for the amount of time between the two specified entries
     */
    private async sleepForEntryGap() {
        const currentEntry = this.entries[this.entryIndex];
        const previousEntry = this.entries[this.entryIndex - 1];
        let gap = 0;
        if (currentEntry && previousEntry) {
            gap = currentEntry.timestamp.getTime() - previousEntry?.timestamp.getTime();
            //if the gap is negative, then the time has already passed. Just timeout at zero
            gap = gap > 0 ? gap : 0;
        }
        //longer delays make the test run slower, but don't really make the test any more accurate,
        //so cap the delay at 100ms
        if (gap > 100) {
            gap = 100;
        }
        await util.sleep(gap);
    }

    public async destroy() {
        for (const dispose of this.disposables) {
            try {
                await Promise.resolve(dispose());
            } catch { }
        }
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
    type: 'client-to-server' | 'server-to-client' | 'io';
    timestamp: Date;
    buffer: Buffer;
}
