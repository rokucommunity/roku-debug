import * as readline from 'readline';
import * as net from 'net';
import type { LaunchConfiguration } from './LaunchConfiguration';
import { BrightScriptDebugSession } from './debugSession/BrightScriptDebugSession';

/**
 * A minimal DAP message parser that reads the Content-Length framed JSON messages
 * from a readable stream and emits them as parsed objects.
 */
export class DapMessageParser {
    private buffer = '';

    /**
     * Feed raw data into the parser. Returns any complete messages found.
     */
    public feed(data: string): Array<Record<string, any>> {
        this.buffer += data;
        const messages: Array<Record<string, any>> = [];

        while (true) {
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) {
                break;
            }
            const header = this.buffer.substring(0, headerEnd);
            const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
            if (!lengthMatch) {
                break;
            }
            const contentLength = parseInt(lengthMatch[1], 10);
            const bodyStart = headerEnd + 4;
            if (this.buffer.length < bodyStart + contentLength) {
                break;
            }
            const body = this.buffer.substring(bodyStart, bodyStart + contentLength);
            this.buffer = this.buffer.substring(bodyStart + contentLength);
            try {
                messages.push(JSON.parse(body) as Record<string, any>);
            } catch {
                // ignore malformed messages
            }
        }
        return messages;
    }
}

/**
 * Formats a DAP protocol message with the required Content-Length header.
 */
export function formatDapMessage(message: Record<string, any>): string {
    const body = JSON.stringify(message);
    return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

/**
 * Drives a BrightScriptDebugSession from the command line. It starts the debug
 * adapter as an in-process TCP server and connects to it with a minimal DAP client
 * that sends the initialization sequence and forwards device output to the terminal.
 */
export class CliDebugger {
    private seq = 1;
    private server: net.Server | undefined;
    private socket: net.Socket | undefined;
    private rl: readline.Interface | undefined;
    private parser = new DapMessageParser();

    public constructor(private readonly config: Partial<LaunchConfiguration>) {
    }

    /**
     * Starts the CLI debug session. Resolves when the session ends.
     */
    public async start(): Promise<void> {
        const port = await this.startAdapterServer();
        const socket = await this.connectToAdapter(port);
        this.socket = socket;

        this.setupSocketHandlers(socket);
        this.sendInitialize();
        this.setupReadlineInterface();
        this.printHelp();

        // Keep the process alive until the socket closes
        return new Promise<void>((resolve) => {
            socket.on('close', () => {
                this.cleanup();
                resolve();
            });
        });
    }

    /**
     * Starts BrightScriptDebugSession as a TCP server and returns the port it is
     * listening on.
     */
    private startAdapterServer(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = net.createServer((clientSocket) => {
                const session = new BrightScriptDebugSession();
                session.setRunAsServer(true);
                session.start(clientSocket, clientSocket);
            });
            this.server = server;

            server.listen(0, '127.0.0.1', () => {
                const addr = server.address() as net.AddressInfo;
                resolve(addr.port);
            });

            server.on('error', reject);
        });
    }

    /**
     * Opens a TCP connection to the debug adapter server.
     */
    private connectToAdapter(port: number): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
                resolve(socket);
            });
            socket.on('error', reject);
        });
    }

    /**
     * Wires up handlers for data and errors on the adapter socket.
     */
    private setupSocketHandlers(socket: net.Socket): void {
        socket.setEncoding('utf8');

        socket.on('data', (data: string) => {
            const messages = this.parser.feed(data);
            for (const message of messages) {
                this.handleMessage(message);
            }
        });

        socket.on('error', (err) => {
            console.error('[roku-debug] Connection error:', err.message);
        });
    }

    /**
     * Creates a readline interface so the user can type commands interactively.
     */
    private setupReadlineInterface(): void {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'roku-debug> '
        });
        this.rl = rl;

        rl.on('line', (line) => {
            this.handleUserInput(line.trim());
            rl.prompt();
        });

        rl.on('close', () => {
            this.sendDisconnect();
        });
    }

    // ------------------------------------------------------------------ DAP send helpers

    private nextSeq(): number {
        return this.seq++;
    }

    private sendMessage(message: Record<string, any>): void {
        if (this.socket && !this.socket.destroyed) {
            this.socket.write(formatDapMessage(message));
        }
    }

    private sendRequest(command: string, args?: Record<string, any>): void {
        this.sendMessage({
            seq: this.nextSeq(),
            type: 'request',
            command,
            arguments: args ?? {}
        });
    }

    private sendInitialize(): void {
        this.sendRequest('initialize', {
            clientID: 'roku-debug-cli',
            clientName: 'roku-debug CLI',
            adapterID: 'brightscript',
            pathFormat: 'path',
            linesStartAt1: true,
            columnsStartAt1: true,
            supportsVariableType: true,
            supportsVariablePaging: true,
            supportsRunInTerminalRequest: false,
            locale: 'en-us'
        });
    }

    private sendLaunch(): void {
        this.sendRequest('launch', {
            ...this.config,
            // Ensure cwd is always set
            cwd: this.config.cwd ?? process.cwd(),
            // Ensure rootDir defaults to cwd
            rootDir: this.config.rootDir ?? this.config.cwd ?? process.cwd()
        });
    }

    private sendConfigurationDone(): void {
        this.sendRequest('configurationDone');
    }

    private sendDisconnect(): void {
        this.sendRequest('disconnect', { terminateDebuggee: true });
    }

    private sendContinue(threadId = 1): void {
        this.sendRequest('continue', { threadId });
    }

    private sendNext(threadId = 1): void {
        this.sendRequest('next', { threadId });
    }

    private sendStepIn(threadId = 1): void {
        this.sendRequest('stepIn', { threadId });
    }

    private sendStepOut(threadId = 1): void {
        this.sendRequest('stepOut', { threadId });
    }

    private sendPause(threadId = 1): void {
        this.sendRequest('pause', { threadId });
    }

    private sendEvaluate(expression: string, frameId?: number): void {
        this.sendRequest('evaluate', {
            expression,
            frameId,
            context: 'repl'
        });
    }

    // ------------------------------------------------------------------ message handling

    private handleMessage(message: Record<string, any>): void {
        if (message.type === 'event') {
            this.handleEvent(message);
        } else if (message.type === 'response') {
            this.handleResponse(message);
        }
    }

    private handleEvent(event: Record<string, any>): void {
        switch (event.event) {
            case 'initialized':
                this.onInitialized();
                break;
            case 'output':
                this.onOutput(event.body as Record<string, any>);
                break;
            case 'stopped':
                this.onStopped(event.body as Record<string, any>);
                break;
            case 'continued':
                process.stdout.write('[roku-debug] Continued\n');
                break;
            case 'terminated':
                process.stdout.write('[roku-debug] Debug session terminated\n');
                this.cleanup();
                break;
            case 'thread':
                // silently handle thread events
                break;
            default:
                // Ignore unknown events
                break;
        }
    }

    private handleResponse(response: Record<string, any>): void {
        if (!response.success && response.message) {
            console.error(`[roku-debug] Error response for '${response.command}': ${response.message}`);
        }
        if (response.command === 'initialize' && response.success) {
            this.sendLaunch();
        } else if (response.command === 'evaluate' && response.success) {
            const body = response.body as Record<string, any> | undefined;
            if (body?.result !== undefined) {
                process.stdout.write(`= ${body.result}\n`);
            }
        }
    }

    private onInitialized(): void {
        // After receiving 'initialized', send configurationDone so the session can proceed
        this.sendConfigurationDone();
    }

    private onOutput(body: Record<string, any>): void {
        if (!body) {
            return;
        }
        const category = body.category ?? 'console';
        const output = String(body.output ?? '').replace(/\n$/, '');
        if (output) {
            if (category === 'stderr') {
                process.stderr.write(`${output}\n`);
            } else {
                process.stdout.write(`${output}\n`);
            }
        }
    }

    private onStopped(body: Record<string, any>): void {
        if (!body) {
            return;
        }
        const reason = body.reason ?? 'breakpoint';
        process.stdout.write(`\n[roku-debug] Stopped: ${reason}\n`);
        this.rl?.prompt();
    }

    // ------------------------------------------------------------------ user input

    private handleUserInput(input: string): void {
        if (!input) {
            return;
        }
        const [command, ...args] = input.split(/\s+/);

        switch (command.toLowerCase()) {
            case 'c':
            case 'cont':
            case 'continue':
                this.sendContinue();
                break;
            case 'n':
            case 'next':
                this.sendNext();
                break;
            case 's':
            case 'step':
            case 'stepin':
                this.sendStepIn();
                break;
            case 'o':
            case 'stepout':
                this.sendStepOut();
                break;
            case 'p':
            case 'pause':
                this.sendPause();
                break;
            case 'eval':
            case 'e':
                if (args.length > 0) {
                    this.sendEvaluate(args.join(' '));
                } else {
                    process.stdout.write('Usage: eval <expression>\n');
                }
                break;
            case 'q':
            case 'quit':
            case 'exit':
                this.sendDisconnect();
                break;
            case 'h':
            case 'help':
                this.printHelp();
                break;
            default:
                process.stdout.write(`Unknown command: '${command}'. Type 'help' for available commands.\n`);
                break;
        }
    }

    private printHelp(): void {
        process.stdout.write([
            '',
            'roku-debug CLI commands:',
            '  c, cont, continue  - Resume execution',
            '  n, next            - Step over (next line)',
            '  s, step, stepin    - Step into function',
            '  o, stepout         - Step out of function',
            '  p, pause           - Pause execution',
            '  e, eval <expr>     - Evaluate an expression',
            '  h, help            - Show this help',
            '  q, quit, exit      - Quit the debugger',
            ''
        ].join('\n'));
    }

    private cleanup(): void {
        this.rl?.close();
        this.socket?.destroy();
        this.server?.close();
    }
}

