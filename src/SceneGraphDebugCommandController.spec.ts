import * as sinon from 'sinon';
import { expect } from 'chai';
import * as stream from 'stream';
import { SceneGraphDebugCommandController } from './SceneGraphDebugCommandController';

describe('SceneGraphDebugCommandController ', () => {
    let commandController: SceneGraphDebugCommandController;
    let execStub: sinon.SinonStub;

    beforeEach(() => {
        commandController = new SceneGraphDebugCommandController('192.168.1.1');
        commandController['connection'] = {};
        execStub = sinon.stub(commandController, 'exec').callsFake((command: string) => {
            return new Promise((resolve) => {
                switch (command) {
                    case 'fps_display':
                    case 'fps_display 0':
                    case 'fps_display 1':
                        resolve({
                            command: command,
                            result: {
                                rawResponse: ''
                            }
                        });
                        break;

                    default:
                        resolve({
                            command: command,
                            result: {
                                rawResponse: ''
                            }
                        });
                        break;
                }
            });
        });
    });

    afterEach(() => {
        execStub.restore();
    });

    describe('formats bsprof correctly', () => {
        it('bsprof-pause', async () => {
            await commandController.bsprof('pause');
            expect(execStub.withArgs('bsprof-pause').calledOnce).to.be.true;
        });

        it('bsprof-resume', async () => {
            await commandController.bsprof('resume');
            expect(execStub.withArgs('bsprof-resume').calledOnce).to.be.true;
        });

        it('bsprof-status', async () => {
            await commandController.bsprof('status');
            expect(execStub.withArgs('bsprof-status').calledOnce).to.be.true;
        });
    });

    describe('formats chanperf correctly', () => {
        it('chanperf', async () => {
            await commandController.chanperf();
            expect(execStub.withArgs('chanperf').calledOnce).to.be.true;
        });

        it('chanperf -r 1', async () => {
            await commandController.chanperf({ interval: 1 });
            expect(execStub.withArgs('chanperf -r 1').calledOnce).to.be.true;
        });

        it('chanperf -r 0', async () => {
            await commandController.chanperf({ interval: 0 });
            expect(execStub.withArgs('chanperf -r 0').calledOnce).to.be.true;
        });

        it('chanperf when given negative interval', async () => {
            await commandController.chanperf({ interval: -1 });
            expect(execStub.withArgs('chanperf').calledOnce).to.be.true;
        });
    });

    describe('formats simple commands without arguments correctly', () => {
        it('clear_launch_caches', async () => {
            await commandController.clearLaunchCaches();
            expect(execStub.withArgs('clear_launch_caches').calledOnce).to.be.true;
        });

        it('free', async () => {
            await commandController.free();
            expect(execStub.withArgs('free').calledOnce).to.be.true;
        });

        it('genkey', async () => {
            await commandController.genkey();
            expect(execStub.withArgs('genkey').calledOnce).to.be.true;
        });

        it('loaded_textures', async () => {
            await commandController.loadedTextures();
            expect(execStub.withArgs('loaded_textures').calledOnce).to.be.true;
        });

        it('plugins', async () => {
            await commandController.plugins();
            expect(execStub.withArgs('plugins').calledOnce).to.be.true;
        });

        it('r2d2_bitmaps', async () => {
            await commandController.r2d2Bitmaps();
            expect(execStub.withArgs('r2d2_bitmaps').calledOnce).to.be.true;
        });

        it('showkey', async () => {
            await commandController.showkey();
            expect(execStub.withArgs('showkey').calledOnce).to.be.true;
        });
    });

    describe('formats fps_display correctly', () => {
        it('fps_display', async () => {
            await commandController.fpsDisplay('toggle');
            expect(execStub.withArgs('fps_display').calledOnce).to.be.true;
        });

        it('fps_display 1', async () => {
            await commandController.fpsDisplay('on');
            expect(execStub.withArgs('fps_display 1').calledOnce).to.be.true;
        });

        it('fps_display 0', async () => {
            await commandController.fpsDisplay('off');
            expect(execStub.withArgs('fps_display 0').calledOnce).to.be.true;
        });
    });

    describe('formats logrendezvous correctly', () => {
        it('logrendezvous', async () => {
            await commandController.logrendezvous('status');
            expect(execStub.withArgs('logrendezvous').calledOnce).to.be.true;
        });

        it('logrendezvous on', async () => {
            await commandController.logrendezvous('on');
            expect(execStub.withArgs('logrendezvous on').calledOnce).to.be.true;
        });

        it('logrendezvous off', async () => {
            await commandController.logrendezvous('off');
            expect(execStub.withArgs('logrendezvous off').calledOnce).to.be.true;
        });
    });

    describe('formats press correctly', () => {
        it('press up', async () => {
            await commandController.press(['up']);
            expect(execStub.withArgs('press up').calledOnce).to.be.true;
        });

        it('press up, down, left, right', async () => {
            await commandController.press(['up', 'down', 'left', 'right']);
            expect(execStub.withArgs('press up, down, left, right').calledOnce).to.be.true;
        });
    });

    describe('formats removePlugin correctly', () => {
        it('remove_plugin 12345', async () => {
            await commandController.removePlugin('12345');
            expect(execStub.withArgs('remove_plugin 12345').calledOnce).to.be.true;
        });

        it('remove_plugin 12345_aeft', async () => {
            await commandController.removePlugin('12345_aeft');
            expect(execStub.withArgs('remove_plugin 12345_aeft').calledOnce).to.be.true;
        });
    });

    describe('formats sgnodes correctly', () => {
        it('sgnodes all', async () => {
            await commandController.sgnodes('all');
            expect(execStub.withArgs('sgnodes all').calledOnce).to.be.true;
        });

        it('sgnodes roots', async () => {
            await commandController.sgnodes('roots');
            expect(execStub.withArgs('sgnodes roots').calledOnce).to.be.true;
        });

        it('sgnodes my_custom_id', async () => {
            await commandController.sgnodes('my_custom_id');
            expect(execStub.withArgs('sgnodes my_custom_id').calledOnce).to.be.true;
        });
    });

    describe('formats sgperf correctly', () => {
        it('sgperf start', async () => {
            await commandController.sgperf('start');
            expect(execStub.withArgs('sgperf start').calledOnce).to.be.true;
        });

        it('sgperf clear', async () => {
            await commandController.sgperf('clear');
            expect(execStub.withArgs('sgperf clear').calledOnce).to.be.true;
        });

        it('sgperf report', async () => {
            await commandController.sgperf('report');
            expect(execStub.withArgs('sgperf report').calledOnce).to.be.true;
        });

        it('sgperf stop', async () => {
            await commandController.sgperf('stop');
            expect(execStub.withArgs('sgperf stop').calledOnce).to.be.true;
        });
    });

    describe('formats type correctly', () => {
        it('type my message', async () => {
            await commandController.type('my message');
            expect(execStub.withArgs('type my message').calledOnce).to.be.true;
        });
    });

    describe('formats custom correctly', () => {
        it('chanperf -r 10', async () => {
            await commandController.exec('chanperf -r 10');
            expect(execStub.withArgs('chanperf -r 10').calledOnce).to.be.true;
        });

        it('super secrete command', async () => {
            await commandController.exec('super secrete command');
            expect(execStub.withArgs('super secrete command').calledOnce).to.be.true;
        });
    });
});

/**
 * Minimal fake standing in for roku-deploy's TelnetSocket. Genuinely extends `stream.Duplex`
 * (rather than just an EventEmitter) because the controller hands this straight to telnet-client as
 * an injected `sock`, and telnet-client's `_checkSocket()` guard requires `pipe`, `_write`,
 * `_writableState`, `_read`, and `_readableState`, all of which only a real Node stream provides.
 */
class FakeTelnetSocket extends stream.Duplex {
    public writtenChunks: string[] = [];

    /**
     * Text pushed shortly after connect(), simulating the device's connection greeting. Defaults to
     * a local device's shape: a leading blank line followed by a bare `>` prompt with no trailing
     * newline. RCE-shaped scenarios would instead see a banner line with no prompt at all (the Roku
     * Cloud Emulator's debug-server proxy holds the promptless `>` forever), which is why the
     * controller has to drain this itself rather than relying on telnet-client's own prompt wait.
     */
    public initialGreeting = '\r\n>';

    /**
     * When set, connect() emits 'error' instead of 'connect', simulating a transport-level connect
     * failure (the tcp handshake or websocket handshake itself failing).
     */
    public connectShouldFail: Error | undefined;

    /**
     * Canned response text to push, one per queued entry, the next time data is written to this
     * socket. Each response is pushed on a later tick so it always arrives after the write that
     * triggered it, the same way a real device's response arrives strictly after the command that
     * produced it.
     */
    public queuedResponses: string[] = [];

    public connect(connectListener?: () => void): this {
        if (this.connectShouldFail) {
            setTimeout(() => {
                this.emit('error', this.connectShouldFail);
            }, 0);
            return this;
        }
        if (connectListener) {
            this.once('connect', connectListener);
        }
        setTimeout(() => {
            this.emit('connect');
        }, 0);
        setTimeout(() => {
            this.push(Buffer.from(this.initialGreeting));
        }, 10);
        return this;
    }

    public _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.writtenChunks.push(chunk.toString());
        let response = this.queuedResponses.shift();
        if (response !== undefined) {
            setTimeout(() => {
                this.push(Buffer.from(response));
            }, 0);
        }
        callback();
    }

    public _read(size: number): void {
        //data is pushed as it is scheduled above; nothing to pull on demand
    }

    /**
     * telnet-client calls this unconditionally right after adopting an injected sock (regardless of
     * whether a timeout was ever configured), so it has to exist even though telnet-client's
     * `_checkSocket()` guard itself never checks for it. A missing implementation would throw
     * synchronously inside telnet-client's connect() executor, silently skipping every listener it
     * registers after that point ('data' included) even though the promise had already resolved.
     */
    public setTimeout(milliseconds: number, callback?: () => void): this {
        return this;
    }
}

describe('SceneGraphDebugCommandController transport', () => {
    let controller: SceneGraphDebugCommandController;
    let fakeTelnetSocket: FakeTelnetSocket;
    let createTelnetSocketStub: sinon.SinonStub;

    beforeEach(() => {
        controller = new SceneGraphDebugCommandController('192.168.1.50');
        fakeTelnetSocket = new FakeTelnetSocket();
        createTelnetSocketStub = sinon.stub(controller as any, 'createTelnetSocket').returns(fakeTelnetSocket);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('createTelnetSocket factory', () => {
        it('passes a resolved local device config, channel debug-server, and the configured port when constructed with a host string', async () => {
            await controller.connect();

            expect(createTelnetSocketStub.calledOnce).to.be.true;
            let options = createTelnetSocketStub.firstCall.args[0];
            expect(options.device).to.eql({ host: '192.168.1.50' });
            expect(options.channel).to.equal('debug-server');
            expect(options.port).to.equal(8080);
        });

        it('passes an RCE device config through verbatim when constructed with one', async () => {
            let rceDevice = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'token-value' };
            let rceController = new SceneGraphDebugCommandController(rceDevice, 8080);
            let rceFakeTelnetSocket = new FakeTelnetSocket();
            let rceCreateTelnetSocketStub = sinon.stub(rceController as any, 'createTelnetSocket').returns(rceFakeTelnetSocket);

            await rceController.connect();

            expect(rceCreateTelnetSocketStub.calledOnce).to.be.true;
            let options = rceCreateTelnetSocketStub.firstCall.args[0];
            expect(options.device).to.equal(rceDevice);
            expect(options.channel).to.equal('debug-server');
            expect(options.port).to.equal(8080);
        });
    });

    describe('connect', () => {
        it('drains the connect greeting before handing the socket to telnet-client, so it does not pollute the first exec response', async () => {
            await controller.connect();

            expect(controller['connection']).to.exist;
            expect(createTelnetSocketStub.calledOnce).to.be.true;

            fakeTelnetSocket.queuedResponses.push('abc123\r\n>');
            let response = await controller.exec('showkey');

            //if the greeting had not been drained first, its bytes would still be sitting in front
            //of the real response text here
            expect(response.error).to.be.undefined;
            expect(response.result.rawResponse).to.include('abc123');
            expect(response.result.rawResponse.startsWith('>')).to.be.false;
        });

        it('destroys the socket when the transport connect fails', async () => {
            fakeTelnetSocket.connectShouldFail = new Error('connect ECONNREFUSED 192.168.1.50:8080');

            let thrownError: Error | undefined;
            try {
                await controller.connect();
            } catch (e) {
                thrownError = e as Error;
            }

            expect(thrownError).to.be.instanceOf(Error);
            expect(thrownError.message).to.include('ECONNREFUSED');
            expect(fakeTelnetSocket.destroyed).to.be.true;
            expect(controller['connection']).to.be.null;
        });
    });
});
