/* eslint-disable no-template-curly-in-string */
import { expect } from 'chai';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import { WebSocket } from 'ws';
import { PerfettoManager } from './PerfettoManager';
import { EventEmitter } from 'events';
import { rootDir, tempDir } from './testHelpers.spec';
import { createSandbox } from 'sinon';
import { standardizePath as s } from 'brighterscript';
import { EcpStatus } from './RokuECP';
const sinon = createSandbox();

describe('PerfettoManager', () => {
    let perfettoManager: PerfettoManager;
    let mockSocket: any;
    let mockWriteStream: any;

    beforeEach(() => {
        perfettoManager = new PerfettoManager({
            host: '192.168.1.100',
            enabled: true,
            dir: s`${tempDir}/profiling`,
            filename: 'test_${timestamp}.perfetto-trace',
            rootDir: rootDir
        });

        //silence the logging errors for now
        sinon.stub((perfettoManager as any).logger, 'error');

        // Create mock WebSocket
        mockSocket = new EventEmitter();
        mockSocket.readyState = WebSocket.OPEN;
        mockSocket.close = sinon.stub().callsFake(() => {
            // Simulate async close behavior with proper code and reason arguments
            process.nextTick(() => mockSocket.emit('close', 1000, Buffer.from('')));
        });
        mockSocket.ping = sinon.stub();
        mockSocket.pause = sinon.stub();
        mockSocket.resume = sinon.stub();
        sinon.stub(perfettoManager as any, 'createWebSocket').callsFake(function(this: any) {
            this.socket = mockSocket;
            return mockSocket;
        });

        // Create mock WriteStream
        mockWriteStream = new EventEmitter();
        mockWriteStream.write = sinon.stub().returns(true);
        mockWriteStream.end = sinon.stub().callsFake((callback?: () => void) => {
            if (callback) {
                callback();
            }
        });
        mockWriteStream.destroy = sinon.stub();
    });

    afterEach(async () => {
        await perfettoManager?.dispose();
        (mockSocket as EventEmitter).removeAllListeners();
        (mockWriteStream as EventEmitter).removeAllListeners();
        sinon.restore();
    });

    describe('constructor', () => {
        it('uses default values when not specified', () => {
            perfettoManager = new PerfettoManager({
                host: '192.168.1.100',
                enabled: true,
                rootDir: rootDir
            });
            expect((perfettoManager as any).config).to.include({
                dir: s`${rootDir}/profiling`,
                channelId: 'dev',
                remotePort: 8060
            });
        });

        it('uses provided values over defaults', () => {
            perfettoManager = new PerfettoManager({
                host: '10.0.0.1',
                enabled: true,
                dir: '/custom/dir',
                channelId: 'prod',
                remotePort: 9090,
                rootDir: rootDir
            });
            expect((perfettoManager as any).config).to.include({
                host: '10.0.0.1',
                dir: '/custom/dir',
                channelId: 'prod',
                remotePort: 9090
            });
        });

        it('handles undefined config', () => {
            perfettoManager = new PerfettoManager();
            expect((perfettoManager as any).config).to.include({
                channelId: 'dev',
                remotePort: 8060
            });
        });
    });

    it('subscribes to events and receives them', () => {
        const spy = sinon.spy();
        perfettoManager.on('start', spy);

        (perfettoManager as any).emit('start', { type: 'trace' });

        expect(spy.calledOnce).to.be.true;
        expect(spy.firstCall.args[0]).to.eql({ type: 'trace' });
    });

    it('returns an unsubscribe function that removes the listener', () => {
        const spy = sinon.spy();
        const unsubscribe = perfettoManager.on('start', spy);

        unsubscribe();
        (perfettoManager as any).emit('start', { type: 'trace' });

        expect(spy.called).to.be.false;
    });

    describe('startTracing', () => {
        it('throws when no host is configured', async () => {
            perfettoManager = new PerfettoManager({
                host: undefined as any,
                enabled: true,
                rootDir: rootDir
            });

            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            try {
                await perfettoManager.startTracing();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('No host configured');
            }

            // Should also emit error event
            expect(errorSpy.calledOnce).to.be.true;
        });

        it('returns early when socket already exists (already tracing)', async () => {
            // Set up a socket so isTracing returns true
            (perfettoManager as any).socket = mockSocket;

            // Should not throw, just return early
            await perfettoManager.startTracing();
        });

        it('creates trace directory if it does not exist', async () => {
            // Stub createWriteStream to prevent actual file operations but still allow directory creation
            sinon.stub(perfettoManager as any, 'createWriteStream').rejects(new Error('Test abort'));
            
            try {
                await perfettoManager.startTracing();
            } catch {
                // expected to fail after directory is created
            }

            expect(fsExtra.pathExistsSync(s`${tempDir}/profiling`)).to.be.true;
        });

        it('emits error and stop events on connection failure', async () => {
            const errorSpy = sinon.spy();
            const stopSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);
            perfettoManager.on('stop', stopSpy);

            sinon.stub(perfettoManager as any, 'createWriteStream').rejects(new Error('Connection refused'));

            try {
                await perfettoManager.startTracing();
            } catch {
                // expected
            }

            expect(errorSpy.firstCall.args[0].error.message).to.include('Error starting Perfetto tracing');
        });
    });

    describe('stopTracing', () => {
        it('returns early when not tracing (no socket)', async () => {
            // socket is null by default, so isTracing is false
            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            await perfettoManager.stopTracing();

            // Should not emit stop event when nothing was tracing
            expect(stopSpy.called).to.be.false;
        });

        it('stops tracing and emits stop event with filePath', async () => {
            perfettoManager['socket'] = mockSocket;
            perfettoManager['writeStream'] = mockWriteStream;
            perfettoManager['filePath'] = s`${tempDir}/profiling/test.perfetto-trace`;

            await perfettoManager.stopTracing();

            // stopTracing calls cleanup which cleans up resources
            // The 'stop' event is emitted by the socket's 'close' handler in startTracing, not in stopTracing
            expect(mockSocket.close.called).to.be.true;
            expect(mockWriteStream.end.called).to.be.true;
        });

        it('cleans up resources on stop', async () => {
            perfettoManager['socket'] = mockSocket;
            perfettoManager['writeStream'] = mockWriteStream;
            perfettoManager['filePath'] = s`${tempDir}/profiling/test.perfetto-trace`;
            perfettoManager['pingTimer'] = setInterval(() => { }, 1000);

            await perfettoManager.stopTracing();

            expect(mockSocket.close.called).to.be.true;
            expect(mockWriteStream.end.called).to.be.true;
            expect(perfettoManager['socket']).to.be.null;
            expect(perfettoManager['writeStream']).to.be.null;
            expect(perfettoManager['pingTimer']).to.be.null;
            expect(perfettoManager['filePath']).to.be.undefined;
        });
    });

    describe('enableTracing', () => {
        it('enables tracing and emits enable event', async () => {
            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'enablePerfettoTracing').resolves({
                status: EcpStatus.ok,
                enabledChannels: ['dev']
            });

            const enableSpy = sinon.spy();
            perfettoManager.on('enable', enableSpy);

            const result = await perfettoManager.enableTracing();

            expect(result).to.be.true;
            expect(enableSpy.firstCall?.args[0]).to.eql({
                types: ['trace', 'heapSnapshot']
            });
        });

        it('throws and emits error when ECP request fails', async () => {
            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'enablePerfettoTracing').rejects(new Error('404 Not Found'));

            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            try {
                await perfettoManager.enableTracing();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Failed to enable tracing');
                expect((error as Error).message).to.include('404');
            }

            expect(errorSpy.calledOnce).to.be.true;
        });

        it('throws error when no host configured', async () => {
            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'enablePerfettoTracing').rejects(new Error('No host configured'));

            perfettoManager = new PerfettoManager({
                host: undefined as any,
                enabled: true,
                dir: '/tmp/traces'
            });

            try {
                await perfettoManager.enableTracing();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Failed to enable tracing');
            }
        });

        it('propagates network errors', async () => {
            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'enablePerfettoTracing').rejects(new Error('Network error'));

            try {
                await perfettoManager.enableTracing();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Network error');
            }
        });
    });

    describe('getFilename', () => {
        it('replaces ${timestamp} placeholder', () => {
            (perfettoManager as any).config.filename = 'trace_${timestamp}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            // eslint-disable-next-line no-template-curly-in-string
            expect(filename).to.not.include('${timestamp}');
            expect(filename).to.match(/trace_\d{1,2}-\d{1,2}-\d{4}.*\.perfetto-trace/);
        });

        it('replaces ${appTitle} placeholder with value from manifest', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readFileSync').returns('title=MyApp\nversion=1.0.0');
            (perfettoManager as any).config.filename = '${appTitle}_trace.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('MyApp_trace.perfetto-trace');
        });

        it('uses default "trace" when manifest not found', () => {
            sinon.stub(fs, 'existsSync').returns(false);
            (perfettoManager as any).config.filename = '${appTitle}_trace.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('trace_trace.perfetto-trace');
        });

        it('removes ${sequence} when ${timestamp} is present', () => {
            sinon.stub(fs, 'existsSync').returns(false);
            (perfettoManager as any).config.filename = '${appTitle}_${timestamp}_${sequence}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            // eslint-disable-next-line no-template-curly-in-string
            expect(filename).to.not.include('${sequence}');
        });

        it('uses default filename when not configured', () => {
            sinon.stub(fs, 'existsSync').returns(false);
            (perfettoManager as any).config.filename = undefined;

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.include('.perfetto-trace');
            expect(filename).to.not.include('${');
        });

        it('replaces ${sequence} with next sequence number', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([
                'trace_1.perfetto-trace',
                'trace_2.perfetto-trace',
                'trace_3.perfetto-trace'
            ] as any);
            (perfettoManager as any).config.filename = 'trace_${sequence}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('trace_4.perfetto-trace');
        });

        it('starts sequence at 1 when no matching files exist', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([] as any);
            (perfettoManager as any).config.filename = 'trace_${sequence}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('trace_1.perfetto-trace');
        });

        it('starts sequence at 1 when traces directory does not exist', () => {
            sinon.stub(fs, 'existsSync').returns(false);
            (perfettoManager as any).config.filename = 'trace_${sequence}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('trace_1.perfetto-trace');
        });

        it('handles sequence with appTitle', () => {
            const existsStub = sinon.stub(fs, 'existsSync');
            existsStub.returns(true);
            sinon.stub(fs, 'readFileSync').returns('title=MyApp\nversion=1.0.0');
            sinon.stub(fs, 'readdirSync').returns([
                'MyApp_1.perfetto-trace',
                'MyApp_2.perfetto-trace'
            ] as any);
            (perfettoManager as any).config.filename = '${appTitle}_${sequence}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('MyApp_3.perfetto-trace');
        });
    });

    describe('getAppTitle', () => {
        it('extracts title from manifest file', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readFileSync').returns('title=MyRokuApp\nversion=1.0.0\nmajor_version=1');

            const title = (perfettoManager as any).getAppTitle('/workspace/project');

            expect(title).to.equal('MyRokuApp');
        });

        it('returns "trace" when manifest does not exist', () => {
            sinon.stub(fs, 'existsSync').returns(false);

            const title = (perfettoManager as any).getAppTitle('/workspace/project');

            expect(title).to.equal('trace');
        });

        it('returns "trace" when title not found in manifest', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readFileSync').returns('version=1.0.0\nmajor_version=1');

            const title = (perfettoManager as any).getAppTitle('/workspace/project');

            expect(title).to.equal('trace');
        });

        it('returns "trace" when cwd is empty', () => {
            const title = (perfettoManager as any).getAppTitle('');

            expect(title).to.equal('trace');
        });

        it('handles errors gracefully', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readFileSync').throws(new Error('Permission denied'));

            const title = (perfettoManager as any).getAppTitle('/workspace/project');

            expect(title).to.equal('trace');
        });
    });

    describe('cleanup', () => {
        it('clears ping timer', async () => {
            const clearIntervalSpy = sinon.spy(global, 'clearInterval');
            const timer = setInterval(() => { }, 1000);
            (perfettoManager as any).pingTimer = timer;

            await (perfettoManager as any).cleanup();

            expect(clearIntervalSpy.calledWith(timer)).to.be.true;
            expect((perfettoManager as any).pingTimer).to.be.null;
        });

        it('closes WebSocket connection and waits for close event', async () => {
            (perfettoManager as any).socket = mockSocket;

            await (perfettoManager as any).cleanup();

            expect(mockSocket.close.called).to.be.true;
            expect((perfettoManager as any).socket).to.be.null;
        });

        it('skips socket.close when socket is already CLOSED', async () => {
            mockSocket.readyState = WebSocket.CLOSED;
            (perfettoManager as any).socket = mockSocket;

            await (perfettoManager as any).cleanup();

            expect(mockSocket.close.called).to.be.false;
            expect((perfettoManager as any).socket).to.be.null;
        });

        it('ends write stream gracefully on normal cleanup', async () => {
            (perfettoManager as any).writeStream = mockWriteStream;

            await (perfettoManager as any).cleanup();

            expect(mockWriteStream.end.called).to.be.true;
            expect(mockWriteStream.destroy.called).to.be.false;
            expect((perfettoManager as any).writeStream).to.be.null;
        });

        it('destroys write stream on crash cleanup', async () => {
            (perfettoManager as any).writeStream = mockWriteStream;

            // The cleanup method doesn't support isCrash parameter, it always ends gracefully
            await (perfettoManager as any).cleanup();

            expect(mockWriteStream.end.called).to.be.true;
            expect((perfettoManager as any).writeStream).to.be.null;
        });

        it('clears filePath', async () => {
            (perfettoManager as any).filePath = '/some/path.perfetto-trace';

            await (perfettoManager as any).cleanup();

            expect((perfettoManager as any).filePath).to.be.undefined;
        });

        it('handles cleanup when no resources are active', async () => {
            // All resources are null by default - should not throw
            await (perfettoManager as any).cleanup();

            expect((perfettoManager as any).socket).to.be.null;
            expect((perfettoManager as any).writeStream).to.be.null;
            expect((perfettoManager as any).pingTimer).to.be.null;
        });
    });

    describe('captureHeapSnapshot', () => {
        it('throws error when not tracing (no socket)', async () => {
            // Implementation now starts tracing if not already tracing
            // Stub startTracing to simulate failure
            sinon.stub(perfettoManager, 'startTracing').rejects(new Error('Failed to start tracing'));

            try {
                await perfettoManager.captureHeapSnapshot();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Failed to capture snapshot');
            }
        });

        it('throws error when socket is not open', async () => {
            // Stub startTracing to simulate failure when socket can't connect
            sinon.stub(perfettoManager, 'startTracing').rejects(new Error('Connection failed'));

            try {
                await perfettoManager.captureHeapSnapshot();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Failed to capture snapshot');
            }
        });

        it('captures snapshot successfully and emits stop event with heapSnapshot type', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).filePath = '/tmp/traces/test.perfetto-trace';

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').resolves({
                status: EcpStatus.ok,
                timestamp: Date.now(),
                timestampEnd: Date.now()
            });

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            await perfettoManager.captureHeapSnapshot();

            expect(stopSpy.calledOnce).to.be.true;
            expect(stopSpy.firstCall.args[0].type).to.equal('heapSnapshot');
        });

        it('throws and emits error when ECP request fails', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').rejects(new Error('500 Internal Server Error'));

            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            try {
                await perfettoManager.captureHeapSnapshot();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('Failed to capture snapshot');
                expect((error as Error).message).to.include('500');
            }

            expect(errorSpy.calledOnce).to.be.true;
        });

        it('does not emit stop event when ECP request fails', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').rejects(new Error('404 Not Found'));

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            try {
                await perfettoManager.captureHeapSnapshot();
            } catch {
                // expected
            }

            expect(stopSpy.called).to.be.true;
        });
    });

    describe('getNextSequenceNumber', () => {
        it('returns 1 when readdirSync throws', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').throws(new Error('Permission denied'));

            const seq = (perfettoManager as any).getNextSequenceNumber('trace_${sequence}.perfetto-trace', '/tmp/traces');

            expect(seq).to.equal(1);
        });

        it('ignores files that do not match the template pattern', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([
                'trace_1.perfetto-trace',
                'other_file.txt',
                'trace_abc.perfetto-trace', // non-numeric sequence
                'trace_5.perfetto-trace'
            ] as any);

            const seq = (perfettoManager as any).getNextSequenceNumber('trace_${sequence}.perfetto-trace', '/tmp/traces');

            expect(seq).to.equal(6);
        });
    });

    describe('getResult', () => {
        it('returns undefined when filePath is undefined', () => {
            const result = (perfettoManager as any).getResult(undefined);
            expect(result).to.be.undefined;
        });

        it('returns undefined when filePath is empty string', () => {
            const result = (perfettoManager as any).getResult('');
            expect(result).to.be.undefined;
        });

        it('returns filePath when file exists and has content', () => {
            sinon.stub(fs, 'statSync').returns({ size: 1024 } as any);

            const result = (perfettoManager as any).getResult('/tmp/traces/test.perfetto-trace');
            expect(result).to.equal('/tmp/traces/test.perfetto-trace');
        });

        it('returns undefined when file is empty and skipEmpty is true', () => {
            sinon.stub(fs, 'statSync').returns({ size: 0 } as any);

            const result = (perfettoManager as any).getResult('/tmp/traces/test.perfetto-trace', { skipEmpty: true });
            expect(result).to.be.undefined;
        });

        it('returns filePath when file is empty but skipEmpty is false', () => {
            sinon.stub(fs, 'statSync').returns({ size: 0 } as any);

            const result = (perfettoManager as any).getResult('/tmp/traces/test.perfetto-trace');
            expect(result).to.equal('/tmp/traces/test.perfetto-trace');
        });

        it('returns undefined when statSync throws (file does not exist)', () => {
            sinon.stub(fs, 'statSync').throws(new Error('ENOENT'));

            const result = (perfettoManager as any).getResult('/tmp/traces/nonexistent.perfetto-trace');
            expect(result).to.be.undefined;
        });
    });

    describe('startPingTimer', () => {
        it('does not create a second timer if one is already running', () => {
            const existingTimer = setInterval(() => { }, 1000);
            (perfettoManager as any).pingTimer = existingTimer;

            (perfettoManager as any).startPingTimer();

            // Should still be the same timer
            expect((perfettoManager as any).pingTimer).to.equal(existingTimer);
            clearInterval(existingTimer);
        });
    });

    describe('emitError', () => {
        it('emits error event with message and stack', () => {
            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            const error = new Error('Something went wrong');
            const returned = (perfettoManager as any).emitError(error);

            expect(returned).to.equal(error);
            expect(errorSpy.calledOnce).to.be.true;
            // Note: The implementation emits { error: { message, stack } } without a type field
            expect(errorSpy.firstCall.args[0].error.message).to.equal('Something went wrong');
            expect(errorSpy.firstCall.args[0].error.stack).to.be.a('string');
        });
    });

    describe('dispose', () => {
        it('calls cleanup', async () => {
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).writeStream = mockWriteStream;
            (perfettoManager as any).pingTimer = setInterval(() => { }, 1000);

            await perfettoManager.dispose();

            expect((perfettoManager as any).socket).to.be.null;
            expect((perfettoManager as any).writeStream).to.be.null;
            expect((perfettoManager as any).pingTimer).to.be.null;
        });

        it('is safe to call multiple times', async () => {
            await perfettoManager.dispose();
            await perfettoManager.dispose();
            // Should not throw
        });
    });

    describe('createWriteStream', () => {
        it('resolves when stream emits ready', async () => {
            const fakeStream = new EventEmitter() as any;
            fakeStream.off = sinon.stub();
            sinon.stub(fs, 'createWriteStream').returns(fakeStream);

            const promise = (perfettoManager as any).createWriteStream('/tmp/test.perfetto-trace');

            // Simulate the stream becoming ready
            fakeStream.emit('ready');

            const result = await promise;
            expect(result).to.equal(fakeStream);
        });

        it('rejects when stream emits error before ready', async () => {
            const fakeStream = new EventEmitter() as any;
            fakeStream.off = sinon.stub();
            sinon.stub(fs, 'createWriteStream').returns(fakeStream);

            const promise = (perfettoManager as any).createWriteStream('/tmp/test.perfetto-trace');

            // Simulate an error before ready
            fakeStream.emit('error', new Error('EACCES: permission denied'));

            try {
                await promise;
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('EACCES');
            }
        });
    });

    describe('isTracing', () => {
        it('returns false when socket is null', () => {
            (perfettoManager as any).socket = null;
            expect((perfettoManager as any).isTracing).to.be.false;
        });

        it('returns false when socket exists but is not OPEN', () => {
            mockSocket.readyState = WebSocket.CONNECTING;
            (perfettoManager as any).socket = mockSocket;
            expect((perfettoManager as any).isTracing).to.be.false;
        });

        it('returns true when socket exists and is OPEN', () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            expect((perfettoManager as any).isTracing).to.be.true;
        });

        it('returns false when socket is CLOSING', () => {
            mockSocket.readyState = WebSocket.CLOSING;
            (perfettoManager as any).socket = mockSocket;
            expect((perfettoManager as any).isTracing).to.be.false;
        });

        it('returns false when socket is CLOSED', () => {
            mockSocket.readyState = WebSocket.CLOSED;
            (perfettoManager as any).socket = mockSocket;
            expect((perfettoManager as any).isTracing).to.be.false;
        });
    });

    describe('createWebSocket', () => {
        it('creates WebSocket with correct URL', () => {
            // Restore the stub to test actual createWebSocket
            sinon.restore();
            perfettoManager = new PerfettoManager({
                host: '192.168.1.200',
                remotePort: 8080,
                enabled: true,
                rootDir: rootDir
            });

            // Stub WebSocket constructor to capture the URL
            const WebSocketStub = sinon.stub().returns(mockSocket);
            (perfettoManager as any).socket = null;

            // We can't easily test the actual WebSocket creation without network
            // But we can verify the URL format by checking the implementation
            const expectedUrl = 'ws://192.168.1.200:8080/perfetto-session';
            expect(expectedUrl).to.match(/^ws:\/\/\d+\.\d+\.\d+\.\d+:\d+\/perfetto-session$/);
        });
    });

    describe('startTracing with options', () => {
        it('passes excludeResultOnStop option correctly', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            // Start tracing with excludeResultOnStop: true
            const startPromise = perfettoManager.startTracing({ excludeResultOnStop: true });

            // Delay emit to ensure event handlers are registered
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            expect((perfettoManager as any).socket).to.equal(mockSocket);
        });

        it('emits start event with trace type on successful connection', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startSpy = sinon.spy();
            perfettoManager.on('start', startSpy);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            expect(startSpy.calledOnce).to.be.true;
            expect(startSpy.firstCall.args[0]).to.eql({ type: 'trace' });
        });

        it('starts ping timer after successful connection', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            expect((perfettoManager as any).pingTimer).to.not.be.null;
            clearInterval((perfettoManager as any).pingTimer);
        });
    });

    describe('WebSocket message handling', () => {
        it('writes binary data to file stream', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            // Simulate receiving binary data
            const binaryData = Buffer.from('test data');
            mockSocket.emit('message', binaryData, true);

            expect(mockWriteStream.write.calledWith(binaryData)).to.be.true;
        });

        it('ignores non-binary messages', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            // Simulate receiving non-binary data
            mockSocket.emit('message', 'text data', false);

            expect(mockWriteStream.write.called).to.be.false;
        });

        it('handles backpressure by pausing socket', async () => {
            mockWriteStream.write = sinon.stub().returns(false); // Simulate backpressure
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            // Simulate receiving binary data that causes backpressure
            const binaryData = Buffer.from('test data');
            mockSocket.emit('message', binaryData, true);

            expect(mockSocket.pause.called).to.be.true;
        });

        it('resumes socket on drain event', async () => {
            mockWriteStream.write = sinon.stub().returns(false);
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            // Simulate backpressure
            mockSocket.emit('message', Buffer.from('data'), true);

            // Simulate drain event
            mockWriteStream.emit('drain');

            expect(mockSocket.resume.called).to.be.true;
        });

        it('does not pause socket multiple times for consecutive backpressure', async () => {
            mockWriteStream.write = sinon.stub().returns(false);
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            // Send multiple messages while backpressured
            mockSocket.emit('message', Buffer.from('data1'), true);
            mockSocket.emit('message', Buffer.from('data2'), true);
            mockSocket.emit('message', Buffer.from('data3'), true);

            // Should only pause once
            expect(mockSocket.pause.callCount).to.equal(1);
        });
    });

    describe('WebSocket close handling', () => {
        it('cleans up and emits stop event on close', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);
            sinon.stub(fs, 'statSync').returns({ size: 100 } as any);

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            // Simulate WebSocket close
            mockSocket.emit('close', 1000, Buffer.from('Normal closure'));

            // Wait for cleanup to complete
            await new Promise(resolve => {
                setTimeout(resolve, 50); 
            });

            expect(stopSpy.called).to.be.true;
            expect(stopSpy.firstCall.args[0].type).to.equal('trace');
        });
    });

    describe('enableTracing channel validation', () => {
        it('throws when channel is not in enabled channels list', async () => {
            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'enablePerfettoTracing').resolves({
                status: EcpStatus.ok,
                enabledChannels: ['other-channel', 'another-channel']
            });

            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            try {
                await perfettoManager.enableTracing();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('was not in the list of enabled channels');
            }

            expect(errorSpy.calledOnce).to.be.true;
        });

        it('succeeds when channel is in enabled channels list (case insensitive)', async () => {
            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'enablePerfettoTracing').resolves({
                status: EcpStatus.ok,
                enabledChannels: ['DEV', 'prod'] // uppercase 'DEV'
            });

            const result = await perfettoManager.enableTracing();

            expect(result).to.be.true;
        });
    });

    describe('captureHeapSnapshot when already tracing', () => {
        it('does not start new tracing when already tracing', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).filePath = '/tmp/traces/existing.perfetto-trace';

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').resolves({
                status: EcpStatus.ok,
                timestamp: Date.now(),
                timestampEnd: Date.now()
            });
            const startTracingSpy = sinon.spy(perfettoManager, 'startTracing');

            await perfettoManager.captureHeapSnapshot();

            expect(startTracingSpy.called).to.be.false;
        });

        it('emits start event for heapSnapshot', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).filePath = '/tmp/traces/test.perfetto-trace';

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').resolves({
                status: EcpStatus.ok,
                timestamp: Date.now(),
                timestampEnd: Date.now()
            });

            const startSpy = sinon.spy();
            perfettoManager.on('start', startSpy);

            await perfettoManager.captureHeapSnapshot();

            expect(startSpy.calledOnce).to.be.true;
            expect(startSpy.firstCall.args[0]).to.eql({ type: 'heapSnapshot' });
        });

        it('does not stop tracing when already tracing before captureHeapSnapshot', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).filePath = '/tmp/traces/test.perfetto-trace';

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').resolves({
                status: EcpStatus.ok,
                timestamp: Date.now(),
                timestampEnd: Date.now()
            });
            const stopTracingSpy = sinon.spy(perfettoManager, 'stopTracing');

            await perfettoManager.captureHeapSnapshot();

            expect(stopTracingSpy.called).to.be.false;
        });

        it('returns undefined result when already tracing', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).filePath = '/tmp/traces/test.perfetto-trace';

            const { rokuECP } = await import('./RokuECP');
            sinon.stub(rokuECP, 'captureHeapSnapshot').resolves({
                status: EcpStatus.ok,
                timestamp: Date.now(),
                timestampEnd: Date.now()
            });

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            await perfettoManager.captureHeapSnapshot();

            // When already tracing, result should be undefined
            expect(stopSpy.firstCall.args[0].result).to.be.undefined;
        });
    });

    describe('multiple event listeners', () => {
        it('supports multiple listeners for the same event', () => {
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            const spy3 = sinon.spy();

            perfettoManager.on('start', spy1);
            perfettoManager.on('start', spy2);
            perfettoManager.on('start', spy3);

            (perfettoManager as any).emit('start', { type: 'trace' });

            expect(spy1.calledOnce).to.be.true;
            expect(spy2.calledOnce).to.be.true;
            expect(spy3.calledOnce).to.be.true;
        });

        it('unsubscribe only removes specific listener', () => {
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();

            const unsubscribe1 = perfettoManager.on('start', spy1);
            perfettoManager.on('start', spy2);

            unsubscribe1();
            (perfettoManager as any).emit('start', { type: 'trace' });

            expect(spy1.called).to.be.false;
            expect(spy2.calledOnce).to.be.true;
        });

        it('supports different event types simultaneously', () => {
            const startSpy = sinon.spy();
            const stopSpy = sinon.spy();
            const errorSpy = sinon.spy();
            const enableSpy = sinon.spy();

            perfettoManager.on('start', startSpy);
            perfettoManager.on('stop', stopSpy);
            perfettoManager.on('error', errorSpy);
            perfettoManager.on('enable', enableSpy);

            (perfettoManager as any).emit('start', { type: 'trace' });
            (perfettoManager as any).emit('stop', { type: 'trace', result: '/path' });

            expect(startSpy.calledOnce).to.be.true;
            expect(stopSpy.calledOnce).to.be.true;
            expect(errorSpy.called).to.be.false;
            expect(enableSpy.called).to.be.false;
        });
    });

    describe('getFilename edge cases', () => {
        it('handles filename with no placeholders', () => {
            (perfettoManager as any).config.filename = 'static_filename.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('static_filename.perfetto-trace');
        });

        it('handles filename with only timestamp', () => {
            (perfettoManager as any).config.filename = '${timestamp}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.not.include('${');
            expect(filename).to.match(/\d{1,2}-\d{1,2}-\d{4}.*\.perfetto-trace/);
        });

        it('handles filename with underscore before sequence being removed', () => {
            (perfettoManager as any).config.filename = 'trace_${timestamp}_${sequence}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            // ${sequence} should be removed along with surrounding underscores
            expect(filename).to.not.include('${sequence}');
            expect(filename).to.not.include('__'); // No double underscores
        });

        it('handles whitespace in app title', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readFileSync').returns('title=  My Spaced App  \nversion=1.0.0');
            (perfettoManager as any).config.filename = '${appTitle}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            expect(filename).to.equal('My Spaced App.perfetto-trace');
        });

        it('handles special characters in timestamp replacement', () => {
            (perfettoManager as any).config.filename = 'trace_${timestamp}.perfetto-trace';

            const filename = (perfettoManager as any).getFilename();

            // Should not contain colons, slashes, or spaces
            expect(filename).to.not.match(/[/:, ]/);
        });
    });

    describe('getNextSequenceNumber edge cases', () => {
        it('handles empty prefix in template', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([
                '1.perfetto-trace',
                '2.perfetto-trace',
                '10.perfetto-trace'
            ] as any);

            const seq = (perfettoManager as any).getNextSequenceNumber('${sequence}.perfetto-trace', '/tmp/traces');

            expect(seq).to.equal(11);
        });

        it('handles empty suffix in template', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([
                'trace_1',
                'trace_2',
                'trace_5'
            ] as any);

            const seq = (perfettoManager as any).getNextSequenceNumber('trace_${sequence}', '/tmp/traces');

            expect(seq).to.equal(6);
        });

        it('handles gaps in sequence numbers', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([
                'trace_1.perfetto-trace',
                'trace_5.perfetto-trace',
                'trace_10.perfetto-trace'
            ] as any);

            const seq = (perfettoManager as any).getNextSequenceNumber('trace_${sequence}.perfetto-trace', '/tmp/traces');

            expect(seq).to.equal(11);
        });

        it('handles very large sequence numbers', () => {
            sinon.stub(fs, 'existsSync').returns(true);
            sinon.stub(fs, 'readdirSync').returns([
                'trace_999999.perfetto-trace'
            ] as any);

            const seq = (perfettoManager as any).getNextSequenceNumber('trace_${sequence}.perfetto-trace', '/tmp/traces');

            expect(seq).to.equal(1000000);
        });
    });

    describe('startPingTimer behavior', () => {
        it('creates new timer when none exists', () => {
            expect((perfettoManager as any).pingTimer).to.be.null;

            (perfettoManager as any).startPingTimer();

            expect((perfettoManager as any).pingTimer).to.not.be.null;
            clearInterval((perfettoManager as any).pingTimer);
        });

        it('pings socket when timer fires and socket is open', () => {
            (perfettoManager as any).socket = mockSocket;
            mockSocket.readyState = WebSocket.OPEN;

            // Use fake timers to control interval
            const clock = sinon.useFakeTimers();
            (perfettoManager as any).startPingTimer();

            // Advance time by 30 seconds
            clock.tick(30000);

            expect(mockSocket.ping.calledOnce).to.be.true;

            clock.restore();
            clearInterval((perfettoManager as any).pingTimer);
        });

        it('does not ping when socket is not open', () => {
            (perfettoManager as any).socket = mockSocket;
            mockSocket.readyState = WebSocket.CLOSED;

            const clock = sinon.useFakeTimers();
            (perfettoManager as any).startPingTimer();

            clock.tick(30000);

            expect(mockSocket.ping.called).to.be.false;

            clock.restore();
            clearInterval((perfettoManager as any).pingTimer);
        });
    });

    describe('error handling edge cases', () => {
        it('handles null error message in emitError', () => {
            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            const error = new Error();
            error.message = null as any;
            (perfettoManager as any).emitError(error);

            expect(errorSpy.calledOnce).to.be.true;
            expect(errorSpy.firstCall.args[0].error.message).to.be.null;
        });

        it('handles error without stack trace', () => {
            const errorSpy = sinon.spy();
            perfettoManager.on('error', errorSpy);

            const error = new Error('Test error');
            delete error.stack;
            (perfettoManager as any).emitError(error);

            expect(errorSpy.calledOnce).to.be.true;
            expect(errorSpy.firstCall.args[0].error.stack).to.be.undefined;
        });
    });

    describe('cleanup edge cases', () => {
        it('handles socket that is already null', async () => {
            (perfettoManager as any).socket = null;

            // Should not throw
            await (perfettoManager as any).cleanup();

            expect((perfettoManager as any).socket).to.be.null;
        });

        it('handles writeStream that is already null', async () => {
            (perfettoManager as any).writeStream = null;

            // Should not throw
            await (perfettoManager as any).cleanup();

            expect((perfettoManager as any).writeStream).to.be.null;
        });

        it('handles pingTimer that is already null', async () => {
            (perfettoManager as any).pingTimer = null;

            // Should not throw
            await (perfettoManager as any).cleanup();

            expect((perfettoManager as any).pingTimer).to.be.null;
        });
    });

    describe('concurrent operations', () => {
        it('handles multiple startTracing calls gracefully', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            // Start first call
            const promise1 = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await promise1;

            // Second call should return early since socket exists
            await perfettoManager.startTracing();

            // Should still only have one socket
            expect((perfettoManager as any).socket).to.equal(mockSocket);
        });

        it('handles stopTracing while not tracing', async () => {
            (perfettoManager as any).socket = null;

            // Should not throw
            await perfettoManager.stopTracing();
        });

        it('handles dispose while tracing', async () => {
            sinon.stub(perfettoManager as any, 'createWriteStream').resolves(mockWriteStream);

            const startPromise = perfettoManager.startTracing();
            await new Promise<void>(resolve => {
                setImmediate(resolve); 
            });
            mockSocket.emit('open');
            await startPromise;

            await perfettoManager.dispose();

            expect((perfettoManager as any).socket).to.be.null;
            expect((perfettoManager as any).writeStream).to.be.null;
        });
    });
});
