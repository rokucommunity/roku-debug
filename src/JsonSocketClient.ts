import { NetConnectOpts, Server, Socket } from 'net';
import { defer, util as rokuDebugUtil } from '../../roku-debug';
import { EventEmitter } from 'eventemitter3';
import { rejects } from 'assert';

export class JsonMessengerServer {
    private server: Server;

    private clients: JsonMessengerClient[] = [];

    public connect(host: string, port: number) {
        const deferred = defer();
        this.server = new Server({});

        //whenever a client makes a connection
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.server.on('connection', (socket: Socket) => {
            const client = new JsonMessengerClient();
            client.setSocket(socket);
            this.clients.push(client);
            client.on('request', (event) => {
                this.emit('request', client, event);
            });
            client.on('response', (event) => {
                this.emit('response', client, event);
            });
        });

        //handle connection errors
        this.server.on('error', (e) => {
            console.error(e);
        });

        this.server.on('close', (client: Socket) => {
            this.clients = this.clients.filter((c) => c.compareSocket(client));
        });

        this.server.listen({
            port: port,
            hostName: host ?? '0.0.0.0'
        }, () => {
            deferred.resolve();
        });
        return deferred.promise;
    }

    public async close() {
        for (const client of this.clients) {
            client.destroy();
        }

        //now close the server
        try {
            await new Promise<void>((resolve, reject) => {
                this.server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        } finally {
            for (const client of this.clients) {
                client.removeAllListeners();
            }
            delete this.clients;
            this.server?.removeAllListeners();
            delete this.server;
        }
    }

    private emitter = new EventEmitter();

    public on(eventName: 'request', handler: (client: JsonMessengerClient, event: JsonEvent) => void);
    public on(eventName: 'response', handler: (client: JsonMessengerClient, event: JsonEvent) => void);
    public on(eventName: string, handler: (client: JsonMessengerClient, payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private async emit<T>(eventName: 'request', client: JsonMessengerClient, data: T);
    private async emit<T>(eventName: 'response', client: JsonMessengerClient, data: T);
    private async emit(eventName: string, client: JsonMessengerClient, data?: any) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        process.nextTick(() => {
            this.emitter?.emit(eventName, client, data);
        });
    }
}

export class JsonMessengerClient {

    private client: Socket;
    private clientDeferred = defer<Socket>();
    private unhandledText = '';

    public compareSocket(socket: Socket) {
        return (socket === this.client);
    }

    public destroy() {
        this.client.destroy();
    }

    public removeAllListeners() {
        this.client.removeAllListeners();
    }

    public connect(host: string, port: number) {
        const socket = new Socket();
        socket.connect({
            host: host,
            port: port
        }, () => {
            this.setSocket(socket);
        });
    }

    public setSocket(socket: Socket) {
        this.clientDeferred.resolve(this.client);
        this.client = socket;
        this.client.on('data', (data) => {
            this.unhandledText += data.toString();
            this.processUnhandledText();
        });
    }

    private processUnhandledText() {
        let data: Buffer | undefined;
        const lines = this.unhandledText.split('\r\n');
        for (const line of lines) {
            if (!line) {
                continue;
            }
            const event = JSON.parse(line);
            this.emit(event.type, event);
        }
    }

    private emitter = new EventEmitter();

    public on(eventName: 'request', handler: (event: JsonEvent) => void);
    public on(eventName: 'response', handler: (event: JsonEvent) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private async emit<T>(eventName: 'request', data: T);
    private async emit<T>(eventName: 'response', data: T);
    private async emit(eventName: string, data?: any) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        process.nextTick(() => {
            this.emitter?.emit(eventName, data);
        });
    }

    private requestIdSequence = 0;

    public sendRequest<R, T = any>(requestName: string, data?: T): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            const eventId = this.requestIdSequence++;
            const json = JSON.stringify({
                id: eventId,
                type: 'request',
                name: requestName,
                data: data
            });

            const timeout = setTimeout(() => {
                reject(new Error('Timeout getting a response'));
            }, 10_000);

            this.on('response', (event) => {
                if (event.id === eventId) {
                    clearTimeout(timeout);
                    resolve(event.data);
                }
            });
            this.client.write(json + '\r\n');
        });
    }

    public sendResponse<T = any>(request: JsonEvent, responseData?: T) {
        const json = JSON.stringify({
            id: request.id,
            type: 'response',
            name: request.name,
            data: responseData
        });
        this.client.write(json + '\r\n');
    }
}

interface JsonEvent<T = any> {
    id: number;
    type: 'request' | 'response' | 'update';
    name: 'get-state' | 'set-state';
    data: T;
}
