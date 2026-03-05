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
            // Simulate async close behavior
            process.nextTick(() => mockSocket.emit('close'));
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

    afterEach(() => {
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
                host: 'localhost',
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
            try {
                await perfettoManager.startTracing();
            } catch {

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

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            await perfettoManager.stopTracing();

            expect(stopSpy.calledOnce).to.be.true;
            expect(stopSpy.firstCall.args[0]).to.eql({
                type: 'trace',
                result: s`${tempDir}/profiling/test.perfetto-trace`
            });
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
            sinon.stub(global as any, 'fetch').resolves({
                ok: true,
                text: () => Promise.resolve('')
            });

            const enableSpy = sinon.spy();
            perfettoManager.on('enable', enableSpy);

            const result = await perfettoManager.enableTracing();

            expect(result).to.be.true;
            expect((global as any).fetch.calledWith(
                'http://192.168.1.100:8060/perfetto/enable/dev',
                sinon.match.object
            )).to.be.true;
            expect(enableSpy.firstCall?.args[0]).to.eql({
                types: ['trace', 'heapSnapshot']
            });
        });

        it('throws and emits error when ECP request fails', async () => {
            sinon.stub(global as any, 'fetch').resolves({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('Endpoint not found')
            });

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
            perfettoManager = new PerfettoManager({
                host: 'localhost',
                enabled: true,
                dir: '/tmp/traces'
            });

            try {
                await perfettoManager.enableTracing();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('No host configured');
            }
        });

        it('propagates network errors', async () => {
            sinon.stub(global as any, 'fetch').rejects(new Error('Network error'));

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

            await (perfettoManager as any).cleanup({ isCrash: true });

            expect(mockWriteStream.destroy.called).to.be.true;
            expect(mockWriteStream.end.called).to.be.false;
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

    describe('ecpPost', () => {
        it('makes POST request with correct parameters', async () => {
            sinon.stub(global as any, 'fetch').resolves({
                ok: true,
                text: () => Promise.resolve('success')
            });

            await (perfettoManager as any).ecpPost('/perfetto/enable/dev', '');

            expect((global as any).fetch.calledWith(
                'http://192.168.1.100:8060/perfetto/enable/dev',
                sinon.match({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
            )).to.be.true;
        });

        it('prepends leading slash to route if missing', async () => {
            sinon.stub(global as any, 'fetch').resolves({
                ok: true,
                text: () => Promise.resolve('success')
            });

            await (perfettoManager as any).ecpPost('perfetto/enable/dev', '');

            expect((global as any).fetch.calledWith(
                'http://192.168.1.100:8060/perfetto/enable/dev',
                sinon.match.object
            )).to.be.true;
        });

        it('throws error when no host configured', async () => {
            perfettoManager = new PerfettoManager({
                host: 'localhost',
                enabled: true
            });

            try {
                await (perfettoManager as any).ecpPost('/perfetto/enable/dev', '');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('No host configured');
            }
        });
    });

    describe('captureHeapSnapshot', () => {
        it('throws error when not tracing (no socket)', async () => {
            try {
                await perfettoManager.captureHeapSnapshot();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('tracing must be active');
            }
        });

        it('throws error when socket is not open', async () => {
            mockSocket.readyState = WebSocket.CLOSED;
            (perfettoManager as any).socket = mockSocket;

            try {
                await perfettoManager.captureHeapSnapshot();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect((error as Error).message).to.include('tracing must be active');
            }
        });

        it('captures snapshot successfully and emits stop event with heapSnapshot type', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;
            (perfettoManager as any).filePath = '/tmp/traces/test.perfetto-trace';

            sinon.stub(global as any, 'fetch').resolves({
                ok: true,
                text: () => Promise.resolve('')
            });

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            await perfettoManager.captureHeapSnapshot();

            expect((global as any).fetch.calledWith(
                'http://192.168.1.100:8060/perfetto/heapgraph/trigger/dev',
                sinon.match.object
            )).to.be.true;
            expect(stopSpy.calledOnce).to.be.true;
            expect(stopSpy.firstCall.args[0]).to.eql({
                type: 'heapSnapshot',
                result: '/tmp/traces/test.perfetto-trace'
            });
        });

        it('throws and emits error when ECP request fails', async () => {
            mockSocket.readyState = WebSocket.OPEN;
            (perfettoManager as any).socket = mockSocket;

            sinon.stub(global as any, 'fetch').resolves({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                text: () => Promise.resolve('Server error')
            });

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

            sinon.stub(global as any, 'fetch').resolves({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                text: () => Promise.resolve('')
            });

            const stopSpy = sinon.spy();
            perfettoManager.on('stop', stopSpy);

            try {
                await perfettoManager.captureHeapSnapshot();
            } catch {
                // expected
            }

            expect(stopSpy.called).to.be.false;
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
            expect(errorSpy.firstCall.args[0]).to.include({
                type: 'trace'
            });
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
});
