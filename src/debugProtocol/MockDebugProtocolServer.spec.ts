import * as net from 'net';
import type { Subscription } from 'rxjs';
import { ReplaySubject } from 'rxjs';
import { SmartBuffer } from 'smart-buffer';
import type { Deferred } from '../util';
import { util, defer } from '../util';

export class MockDebugProtocolServer {
    /**
     * The net server that will be listening for incoming socket connections from clients
     */
    public server: net.Server;
    /**
     * The list of server sockets created in response to clients connecting.
     * There should be one for every client
     */
    public client: Client;

    /**
     * The port that the client should use to send commands
     */
    public controllerPort: number;

    public actions = [] as Action<any>[];

    private clientLoadedPromise: Promise<void>;

    private processActionsSubscription: Subscription;

    public async initialize() {
        const clientDeferred = defer<void>();
        this.clientLoadedPromise = clientDeferred.promise;
        void new Promise((resolve) => {
            this.server = net.createServer((s) => {
                this.client = new Client(s);
                clientDeferred.resolve();
            });
        });
        this.server.listen(0);
        //wait for the server to start listening
        await new Promise<void>((resolve) => {
            this.server.on('listening', () => {
                this.controllerPort = (this.server.address() as net.AddressInfo).port;
                resolve();
            });
        });
    }

    /**
     * After queueing up actions, this method starts processing those actions.
     * If an action cannot be processed yet, it will wait until the client sends the corresponding
     * request. If that request never comes, this server will wait indefinitely
     */
    public async processActions() {
        //wait for a client to connect
        await this.clientLoadedPromise;

        //listen to all events sent to the client
        console.log('subscription being created');
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.processActionsSubscription = this.client.subject.subscribe(async () => {
            console.log('subscription handler fired');
            //process events until one of them returns false.
            //when an event returns false, we will wait for more data to come back and try again
            while (await this.actions[0]?.process(this.client) === true) {
                this.actions.splice(0, 1);
            }
        });
    }

    public waitForMagic() {
        const action = new WaitForMagicAction();
        this.actions.push(action);
        return action;
    }

    public sendHandshakeResponse(magic: Promise<string> | string) {
        const action = new SendHandshakeResponseAction(magic);
        this.actions.push(action);
        return action;
    }

    public reset() {
        this.client?.destroy();
        this.client = undefined;
        this.processActionsSubscription.unsubscribe();
        this.actions = [];
    }

    public destroy() {
        this.server?.close();
        this.server = undefined;
    }
}

class Client {
    constructor(
        public socket: net.Socket
    ) {
        const handler = (data) => {
            this.buffer = Buffer.concat([this.buffer, data]);
            this.subject.next(undefined);
        };
        socket.on('data', handler);
        this.disconnectSocket = () => {
            this.socket.off('data', handler);
        };
    }
    public subject = new ReplaySubject();
    public buffer = Buffer.alloc(0);
    public disconnectSocket: () => void;

    public destroy() {
        this.disconnectSocket();
        this.subject.complete();
        this.socket.destroy();
    }
}

abstract class Action<T> {
    constructor() {
        this.deferred = defer<T>();
    }
    protected deferred: Deferred<T>;
    public get promise() {
        return this.deferred.promise;
    }
    /**
     *
     * @param ref - an object that has a property named "buffer". This is so that, if new data comes in,
     * the client can update the reference to the buffer, and the actions can alter that new buffer directly
     */
    public abstract process(client: Client): Promise<boolean>;
}

class WaitForMagicAction extends Action<string> {
    public process(client: Client) {
        const b = SmartBuffer.fromBuffer(client.buffer);
        try {
            const str = util.readStringNT(b);
            this.deferred.resolve(str);
            client.buffer = client.buffer.slice(b.readOffset);
            return Promise.resolve(true);
        } catch (e) {
            console.error('WaitForMagicAction failed', e);
            return Promise.resolve(false);
        }
    }
}

class SendHandshakeResponseAction extends Action<string> {
    constructor(
        private magic: Promise<string> | string
    ) {
        super();
    }

    public async process(client: Client) {
        console.log('processing handshake response');
        const magic = await Promise.resolve(this.magic);
        const b = new SmartBuffer();
        b.writeStringNT(magic);
        b.writeInt32LE(2);
        b.writeInt32LE(0);
        b.writeInt32LE(0);
        const buffer = b.toBuffer();

        client.socket.write(buffer);
        this.deferred.resolve();
        console.log('sent handshake response');
        return true;
    }
}
