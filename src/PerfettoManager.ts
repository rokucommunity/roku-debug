/* eslint-disable no-template-curly-in-string */
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import { WebSocket } from 'ws';
import { EventEmitter } from 'eventemitter3';
import type { ProfileType } from './debugSession/Events';
import { standardizePath as s } from 'brighterscript';
import { createLogger } from './logging';
import { rokuECP } from './RokuECP';
import { util } from './util';

/**
 * Configuration interface for Perfetto tracing
 */
interface PerfettoConfig {
    host: string;
    enabled?: boolean;
    dir?: string;
    filename?: string;
    rootDir?: string;
    remotePort?: number;
    /** Channel ID to trace. Defaults to 'dev'. */
    channelId?: string;
}

export class PerfettoManager {

    public constructor(config?: PerfettoConfig) {
        this.config = config ?? {} as any;
        this.config.remotePort ??= 8060;
        this.config.channelId ??= 'dev';
        // Set default traces directory if not provided
        this.config.dir ??= s`${this.config.rootDir}/profiling`;
    }

    private config: PerfettoConfig;

    private socket: WebSocket | null = null;
    private writeStream: fs.WriteStream | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private emitter = new EventEmitter();

    /**
     * When tracing is active, this is the file we're currently writing to. Cleaned up whenever tracing stops or errors.
     */
    private filePath?: string;

    private logger = createLogger('PerfettoManager');

    /**
     * Are we actively tracing right now
     */
    private get isTracing() {
        //if we have a socket, we're tracing
        return !!this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    /**
     * Subscribe to PerfettoManager events
     */
    public on(eventName: 'enable', handler: (data: { types: ProfileType[] }) => void): () => void;
    public on(eventName: 'start', handler: (data: { type: ProfileType }) => void): () => void;
    public on(eventName: 'stop', handler: (data: { type: ProfileType; result?: string }) => void): () => void;
    public on(eventName: 'error', handler: (data: { type: ProfileType; error: { message: string; stack?: string } }) => void): () => void;
    public on(eventName: string, handler: (payload: any) => void): () => void {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'enable', data: { types: ProfileType[] }): void;
    private emit(eventName: 'start', data: { type: ProfileType }): void;
    private emit(eventName: 'stop', data: { type: ProfileType; result?: string }): void;
    private emit(eventName: 'error', data: { error: { message: string; stack?: string } }): void;
    private emit(eventName: string, data?: any): void {
        this.emitter.emit(eventName, data);
    }

    /**
     * Get app title from manifest file in cwd
     */
    private getAppTitle(cwd: string): string {
        if (cwd) {
            try {
                const manifestPath = s`${cwd}/manifest`;

                if (fs.existsSync(manifestPath)) {
                    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
                    const titleMatch = /^title=(.+)$/m.exec(manifestContent);
                    if (titleMatch && titleMatch[1]) {
                        return titleMatch[1].trim();
                    }
                }
            } catch (error) {
                this.logger.error('Error reading manifest file:', error);
            }
        }
        return 'trace';
    }

    private createWebSocket() {
        const url = `ws://${this.config.host}:${this.config.remotePort}/perfetto-session`;
        this.socket = new WebSocket(url);
        return this.socket;
    }

    /**
     * Start Perfetto tracing
     * @param includeResultOnStop whether to include the file path when the 'stop' event fires. This should be false if the caller is going to emit their own 'stop' event (like when heapSnapshot is the activator of tracing.
     */
    public async startTracing(options?: { excludeResultOnStop: boolean }): Promise<void> {
        if (!this.config.host) {
            throw this.emitError(new Error('No host configured for Perfetto tracing'));
        }

        try {
            fsExtra.ensureDirSync(this.config.dir);

            //async sanity check, if we're already tracing, don't start again
            if (this.socket) {
                return;
            }
            this.createWebSocket();

            this.filePath = s`${this.config.dir}/${this.getFilename()}`;
            this.writeStream = await this.createWriteStream(this.filePath);


            // Register all handlers before awaiting open
            const connected = new Promise<void>((resolve, reject) => {
                const onConnectOpen = () => {
                    this.socket.off('error', onConnectError);
                    resolve();
                };
                const onConnectError = (error: Error) => {
                    this.socket.off('open', onConnectOpen);
                    //remove our outer error handler since this is a connect error, not a runtime error, and we don't want to emit twice
                    this.socket.off('error', onError);
                    reject(error);
                };
                this.socket.once('open', onConnectOpen);
                this.socket.once('error', onConnectError);
            });

            //register our general error handler next (so it'll be called second, and we can disconnect it if we get a connect error
            const onError = (error: Error) => {
                this.emitError(error);
                // Force-close the socket so the 'close' handler fires cleanup + stop event
                this.socket?.close();
            };
            this.socket.on('error', onError);

            let backpressured = false;
            this.socket.on('message', (data: any, isBinary: boolean) => {
                if (!isBinary || !this.writeStream) {
                    return;
                }
                // Write the binary data to the file, handling backpressure by pausing the socket if the internal buffer is full
                //only the FIRST message that causes backpressure should subscribe to the 'drain' event, to avoid multiple listeners
                if (!this.writeStream.write(data) && !backpressured) {
                    backpressured = true;
                    this.socket?.pause();
                    this.writeStream.once('drain', () => {
                        backpressured = false;
                        this.socket?.resume();
                    });
                }
            });

            this.socket.on('close', (code: number, reason: Buffer) => {
                this.logger.log(`Perfetto WebSocket closed. Code: ${code} Reason: ${reason.toString()}`);
                const filePath = this.filePath;
                this.cleanup().then(() => {
                    this.emit('stop', {
                        type: 'trace',
                        result: options?.excludeResultOnStop
                            ? undefined
                            : this.getResult(filePath, { skipEmpty: true })
                    });
                }).catch(e => this.logger.error(e));
            });

            await connected;

            this.logger.log('Perfetto WebSocket connected:', this.socket.url);

            this.emit('start', { type: 'trace' });

            this.startPingTimer();

            // we crashed, it's almost certainly due to a connection issue, we probably never started
        } catch (error) {
            throw this.emitError(new Error(`Error starting Perfetto tracing: ${error?.message ?? String(error)}`));
        }
    }

    private getFilename(): string {
        let filename = this.config.filename ?? '${appTitle}_${timestamp}.perfetto-trace';

        if (filename.includes('${timestamp}')) {
            const timestamp = new Date()
                .toLocaleString()
                .replace(/[/:, ]/g, '-')
                .replace(/-+/g, '-');
            filename = filename.replaceAll('${timestamp}', timestamp);
            // Remove sequence if the user has put timestamp
            if (filename.includes('${sequence}')) {
                filename = filename.replaceAll(/_?\$\{sequence\}_?/g, '');
            }
        }

        const appTitle = this.getAppTitle(this.config.rootDir || '');
        if (filename.includes('${appTitle}')) {
            filename = filename.replace('${appTitle}', appTitle);
        }

        if (filename.includes('${sequence}')) {
            const nextSequence = this.getNextSequenceNumber(filename, this.config.dir);
            filename = filename.replace('${sequence}', String(nextSequence));
        }

        return filename;
    }

    /**
     * Get the next sequence number by scanning existing files in the directory
     */
    private getNextSequenceNumber(filenameTemplate: string, tracesDir: string): number {
        try {
            if (!fs.existsSync(tracesDir)) {
                return 1;
            }

            const parts = filenameTemplate.split('${sequence}');
            const prefix = parts[0] || '';
            const suffix = parts[1] || '';

            const files = fs.readdirSync(tracesDir);
            let maxSequence = 0;

            for (const file of files) {
                if (file.startsWith(prefix) && file.endsWith(suffix)) {
                    const middle = file.slice(prefix.length, file.length - suffix.length);
                    const seq = parseInt(middle, 10);
                    if (!isNaN(seq) && seq > maxSequence) {
                        maxSequence = seq;
                    }
                }
            }

            return maxSequence + 1;
        } catch (error) {
            this.logger.error('Error getting sequence number:', error);
            return 1;
        }
    }

    /**
     * Stop Perfetto tracing gracefully.
     */
    public async stopTracing(): Promise<void> {
        if (!this.isTracing) {
            return;
        }
        await this.cleanup();
    }

    /**
     * Enable tracing on the Roku device. This returns true if we were successful, and throws if we we failed to enable
     */
    public async enableTracing(): Promise<boolean> {
        this.logger.log(`Enabling Perfetto tracing on channel ${this.config.channelId} at host ${this.config.host}`);

        try {
            const result = await rokuECP.enablePerfettoTracing({
                host: this.config.host,
                remotePort: this.config.remotePort,
                channelId: this.config.channelId
            });
            //fail if our channel isn't in the list of enabled channels, even if the request was successful
            const enabledChannels = result.enabledChannels.map(x => x?.toString()?.toLowerCase() ?? '');
            if (!enabledChannels.includes(this.config.channelId.toLowerCase())) {
                throw new Error(`Failed to enable tracing. The request was successful but ${this.config.channelId} was not in the list of enabled channels: ${result.enabledChannels.join(', ')}`);
            }

            //emit that the following types of profiling are enabled available to start.
            this.emit('enable', { types: ['trace', 'heapSnapshot'] });
            return true;
        } catch (error) {
            throw this.emitError(
                Error(`Failed to enable tracing: ${error?.message}`)
            );
        }
    }

    /**
     * Create a write stream for the given file path, wrapped in a promise to handle async stream readiness and errors.
     * This ensures we don't start writing until the stream is ready, and that any errors are properly caught and emitted.
     * @param filePath
     * @returns
     */
    private async createWriteStream(filePath: string): Promise<fs.WriteStream> {
        const writeStream = await new Promise<fs.WriteStream>((resolve, reject) => {
            const writeStream = fs.createWriteStream(filePath, { flags: 'w' });
            const onReady = () => {
                writeStream.off('error', onError);
                resolve(writeStream);
            };
            const onError = (err: Error) => {
                writeStream.off('ready', onReady);
                this.logger.error('File write error:', err);
                reject(err);
            };
            writeStream.once('ready', onReady);
            writeStream.once('error', onError);
        });
        return writeStream;
    }

    private startPingTimer(): void {
        //skip if we're already pinging
        if (this.pingTimer) {
            return;
        }
        this.pingTimer = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                try {
                    this.socket.ping();
                } catch (e) {
                    this.logger.error('Ping error:', e);
                }
            }
        }, 30_000);
    }

    /**
     * Clean up all resources. Safe to call multiple times.
     * When isCrash is true, destroys the write stream immediately instead of flushing it.
     */
    private async cleanup(): Promise<void> {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        if (this.socket) {
            const socket = this.socket;
            this.socket = null;
            if (socket.readyState !== WebSocket.CLOSED) {
                await new Promise<void>(resolve => {
                    socket.once('close', resolve);
                    socket.close();
                });
            }
            socket.removeAllListeners();
        }

        if (this.writeStream) {
            const writeStream = this.writeStream;
            this.writeStream = null;
            await new Promise<void>(resolve => {
                writeStream.end(() => resolve());
            });
            writeStream.removeAllListeners();
        }

        this.filePath = undefined;
    }

    /**
     * Get a file path if it exists, optionally skipping empty files.
     */
    private getResult(filePath: string | undefined, options?: { skipEmpty?: boolean }): string | undefined {
        if (!filePath) {
            return undefined;
        }
        try {
            const size = fs.statSync(filePath).size;
            if (options?.skipEmpty && size === 0) {
                return undefined;
            }
            return filePath;
        } catch {
            return undefined;
        }
    }

    /**
     * Dispose of all resources. Safe to call multiple times.
     * Closes all sockets, file handles, and timers.
     */
    public async dispose() {
        await this.cleanup();
    }

    /**
     * Capture a heap graph snapshot. Can only be called when tracing is active and WebSocket is connected.
     */
    public async captureHeapSnapshot(): Promise<void> {
        let thisFunctionStartedTracing = false;
        try {
            if (!this.isTracing) {
                thisFunctionStartedTracing = true;
                //start tracing, and exclude the result on stop
                await this.startTracing({
                    excludeResultOnStop: true
                });
            }
            let filePath = this.filePath;

            this.emit('start', {
                type: 'heapSnapshot'
            });

            await rokuECP.captureHeapSnapshot({
                channelId: this.config.channelId,
                host: this.config.host,
                remotePort: this.config.remotePort
            });

            await util.sleep(1000);

            this.emit('stop', {
                type: 'heapSnapshot',
                result: thisFunctionStartedTracing
                    ? this.getResult(filePath, { skipEmpty: true })
                    : undefined
            });

            if (thisFunctionStartedTracing) {
                await this.stopTracing();
            }

        } catch (error) {
            //regardless of success or failure, we want to emit that the snapshot process is no longer active so the UI can update accordingly
            this.emit('stop', {
                type: 'heapSnapshot',
                result: undefined
            });

            if (thisFunctionStartedTracing) {
                await this.stopTracing();
            }
            throw this.emitError(new Error(`Failed to capture snapshot: ${String(error)}`));
        }
    }

    /**
     * Helper to emit an error and also return it for throwing. This ensures all errors go through the same handling and are emitted to any listeners.
     */
    private emitError(error: Error) {
        this.logger.error(error);
        this.emit('error', {
            error: {
                message: error.message,
                stack: error.stack
            }
        });
        return error;
    }
}
