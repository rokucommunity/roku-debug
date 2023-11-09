import { NetConnectOpts, Server, Socket } from 'net';
import { defer, util as rokuDebugUtil } from './util';
import { EventEmitter } from 'eventemitter3';

export class JsonMessengerServer {
    private server: Server;

    private clients: JsonMessengerClient[] = [];

    private clientIdSequence = 1;

    public connect(host: string, port: number) {
        const deferred = defer();
        this.server = new Server({});

        //whenever a client makes a connection
        this.server.on('connection', (socket: Socket) => {
            const client = new JsonMessengerClient();
            client.setSocket(socket);
            // eslint-disable-next-line @typescript-eslint/dot-notation
            client['setId'](0);
            this.clients.push(client);
            client.on('request', (event) => {
                this.emit('request', client, event);
            });
            client.on('response', (event) => {
                this.emit('response', client, event);
            });
            const json = JSON.stringify({
                clientId: this.clientIdSequence++,
                type: 'set-id'
            });

            console.log('setting client id');
            socket.write(json + '\r\n');
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

    private emit<T>(eventName: 'request', client: JsonMessengerClient, data: T);
    private emit<T>(eventName: 'response', client: JsonMessengerClient, data: T);
    private emit(eventName: string, client: JsonMessengerClient, data?: any) {
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
            console.log('received more data ' + data.toString());
            this.unhandledText += data.toString();
            this.processUnhandledText();
        });
    }

    private processUnhandledText() {
        let data: Buffer | undefined;
        let match: RegExpExecArray;
        while ((match = /^(.*?)\r\n/.exec(this.unhandledText))) {
            this.unhandledText = this.unhandledText.substring(match[0].length);
            const event = JSON.parse(match[1]) as JsonEvent;
            if (event.type !== 'set-id') {
                this.emit(event.type as 'request', event);
            } else {
                this.setId(event.clientId);
            }
        }
    }

    private id: number;

    private setId(id: number) {
        this.id = id;
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

    private emit<T>(eventName: 'request', data: T);
    private emit<T>(eventName: 'response', data: T);
    private emit(eventName: string, data?: any) {
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
                clientId: this.id,
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
                    resolve(event.data as R);
                }
            });
            console.log(`Sending json request: ${json}`);
            this.client.write(json + '\r\n');
        });
    }

    public sendResponse<T = any>(request: JsonEvent, responseData?: T) {
        const json = JSON.stringify({
            id: request.id,
            clientId: this.id,
            type: 'response',
            name: request.name,
            data: responseData
        });
        console.log(`Sending json response: ${json}`);
        this.client.write(json + '\r\n');
    }
}

interface JsonEvent<T = any> {
    id: number;
    clientId: number;
    type: 'set-id' | 'request' | 'response' | 'update';
    name: 'get-state' | 'set-state' | 'clear-all';
    data: T;
}
