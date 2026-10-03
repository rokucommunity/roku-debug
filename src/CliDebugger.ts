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

    /** Thread the adapter last reported as stopped. */
    private currentThreadId: number | undefined;
    /** Top stack-frame ID from the most recent stackTrace response. */
    private currentFrameId: number | undefined;

    /**
     * Callbacks waiting for a specific response, keyed by the request sequence number.
     * Used to correlate async DAP responses with the action that triggered them.
     */
    private pendingRequests = new Map<number, (response: Record<string, any>) => void>();

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

    /**
     * Sends a DAP request. If `onResponse` is provided it will be called with the
     * adapter's response for that request (identified by its sequence number).
     */
    private sendRequest(command: string, args?: Record<string, any>, onResponse?: (response: Record<string, any>) => void): void {
        const seq = this.nextSeq();
        this.sendMessage({
            seq,
            type: 'request',
            command,
            arguments: args ?? {}
        });
        if (onResponse) {
            this.pendingRequests.set(seq, onResponse);
        }
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
        }, (response) => {
            if (response.success) {
                const body = response.body as Record<string, any> | undefined;
                if (body?.result !== undefined) {
                    process.stdout.write(`= ${body.result}\n`);
                }
            }
        });
    }

    /**
     * Fetches the call stack for the current thread and resolves with the frames.
     */
    private fetchStackTrace(threadId: number, onDone: (frames: Array<Record<string, any>>) => void): void {
        this.sendRequest('stackTrace', { threadId, startFrame: 0, levels: 20 }, (response) => {
            if (response.success) {
                const body = response.body as Record<string, any> | undefined;
                const frames = (body?.stackFrames as Array<Record<string, any>>) ?? [];
                onDone(frames);
            }
        });
    }

    /**
     * Fetches scopes for the given frame, then fetches all variables for each scope,
     * and calls onDone with a map of scopeName → variable array.
     */
    private fetchVariables(frameId: number, onDone: (scopeMap: Array<{ name: string; variables: Array<Record<string, any>> }>) => void): void {
        this.sendRequest('scopes', { frameId }, (scopesResponse) => {
            if (!scopesResponse.success) {
                return;
            }
            const body = scopesResponse.body as Record<string, any> | undefined;
            const scopes = (body?.scopes as Array<Record<string, any>>) ?? [];
            if (scopes.length === 0) {
                onDone([]);
                return;
            }

            const result: Array<{ name: string; variables: Array<Record<string, any>> }> = [];
            const counter = { remaining: scopes.length };

            for (const scope of scopes) {
                const scopeName = String(scope.name ?? 'Variables');
                const variablesRef = scope.variablesReference as number;
                this.sendRequest('variables', { variablesReference: variablesRef }, (varsResponse) => {
                    const varsBody = varsResponse.body as Record<string, any> | undefined;
                    const variables = (varsBody?.variables as Array<Record<string, any>>) ?? [];
                    result.push({ name: scopeName, variables });
                    counter.remaining--;
                    if (counter.remaining === 0) {
                        onDone(result);
                    }
                });
            }
        });
    }

    /**
     * Fetches child variables for an arbitrary variablesReference (used by `expand`).
     */
    private fetchChildVariables(variablesReference: number, onDone: (variables: Array<Record<string, any>>) => void): void {
        this.sendRequest('variables', { variablesReference }, (response) => {
            if (response.success) {
                const body = response.body as Record<string, any> | undefined;
                onDone((body?.variables as Array<Record<string, any>>) ?? []);
            }
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
        // Dispatch to a pending-request callback if one was registered.
        const reqSeq = response.request_seq as number | undefined;
        if (reqSeq !== undefined) {
            const callback = this.pendingRequests.get(reqSeq);
            if (callback) {
                this.pendingRequests.delete(reqSeq);
                callback(response);
                return;
            }
        }

        // Fallback handling for responses with no registered callback.
        if (!response.success && response.message) {
            console.error(`[roku-debug] Error response for '${response.command}': ${response.message}`);
        }
        if (response.command === 'initialize' && response.success) {
            this.sendLaunch();
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
        const threadId = (body.threadId as number | undefined) ?? 1;
        this.currentThreadId = threadId;

        // Fetch the stack trace to display current location and store the top frame ID.
        this.fetchStackTrace(threadId, (frames) => {
            if (frames.length > 0) {
                this.currentFrameId = frames[0].id as number;
            }
            process.stdout.write(`\n[roku-debug] Stopped: ${reason}\n`);
            if (frames.length > 0) {
                const top = frames[0];
                const src = (top.source as Record<string, any> | undefined)?.path ?? (top.source as Record<string, any> | undefined)?.name ?? '<unknown>';
                const line = top.line ?? '?';
                const name = top.name ?? '<unknown>';
                process.stdout.write(`  at ${name} (${src}:${line})\n`);
            }
            this.rl?.prompt();
        });
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
                this.sendContinue(this.currentThreadId);
                break;
            case 'n':
            case 'next':
                this.sendNext(this.currentThreadId);
                break;
            case 's':
            case 'step':
            case 'stepin':
                this.sendStepIn(this.currentThreadId);
                break;
            case 'o':
            case 'stepout':
                this.sendStepOut(this.currentThreadId);
                break;
            case 'p':
            case 'pause':
                this.sendPause(this.currentThreadId);
                break;
            case 'eval':
            case 'e':
                if (args.length > 0) {
                    this.sendEvaluate(args.join(' '), this.currentFrameId);
                } else {
                    process.stdout.write('Usage: eval <expression>\n');
                }
                break;
            case 'vars':
            case 'variables':
            case 'v':
                this.commandVariables();
                break;
            case 'bt':
            case 'backtrace':
            case 'stack':
                this.commandBacktrace();
                break;
            case 'expand':
            case 'ex':
                if (args.length > 0) {
                    const ref = parseInt(args[0], 10);
                    if (isNaN(ref)) {
                        process.stdout.write('Usage: expand <variablesReference>\n');
                    } else {
                        this.commandExpand(ref);
                    }
                } else {
                    process.stdout.write('Usage: expand <variablesReference>\n');
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

    /**
     * Lists all variables in every scope of the current stack frame.
     */
    private commandVariables(): void {
        if (this.currentFrameId === undefined) {
            process.stdout.write('[roku-debug] Not stopped at a frame. Use \'pause\' or wait for a breakpoint.\n');
            return;
        }
        this.fetchVariables(this.currentFrameId, (scopeMap) => {
            if (scopeMap.length === 0) {
                process.stdout.write('(no variables)\n');
            }
            for (const scope of scopeMap) {
                process.stdout.write(`\n--- ${scope.name} ---\n`);
                this.printVariableTable(scope.variables);
            }
            this.rl?.prompt();
        });
    }

    /**
     * Prints the current call stack.
     */
    private commandBacktrace(): void {
        if (this.currentThreadId === undefined) {
            process.stdout.write('[roku-debug] Not stopped. Use \'pause\' or wait for a breakpoint.\n');
            return;
        }
        this.fetchStackTrace(this.currentThreadId, (frames) => {
            if (frames.length === 0) {
                process.stdout.write('(empty stack)\n');
            } else {
                process.stdout.write('\n');
                for (let i = 0; i < frames.length; i++) {
                    const frame = frames[i];
                    const src = (frame.source as Record<string, any> | undefined)?.path ?? (frame.source as Record<string, any> | undefined)?.name ?? '<unknown>';
                    const line = frame.line ?? '?';
                    const name = frame.name ?? '<unknown>';
                    const marker = i === 0 ? '▶' : ' ';
                    process.stdout.write(`  ${marker} #${i}  ${name}  (${src}:${line})\n`);
                }
            }
            this.rl?.prompt();
        });
    }

    /**
     * Expands a nested variable by its variablesReference number.
     */
    private commandExpand(variablesReference: number): void {
        this.fetchChildVariables(variablesReference, (variables) => {
            if (variables.length === 0) {
                process.stdout.write('(no children)\n');
            } else {
                this.printVariableTable(variables);
            }
            this.rl?.prompt();
        });
    }

    /**
     * Formats a list of DAP Variable objects as a two-column table.
     * Variables that have children include their variablesReference in brackets so
     * the user knows they can use `expand <ref>` to drill in.
     */
    private printVariableTable(variables: Array<Record<string, any>>): void {
        if (variables.length === 0) {
            return;
        }
        // Determine column widths for name and type
        const maxName = Math.max(...variables.map((v) => String(v.name ?? '').length), 4);
        const maxType = Math.max(...variables.map((v) => String(v.type ?? '').length), 4);

        const header = `  ${'Name'.padEnd(maxName)}  ${'Type'.padEnd(maxType)}  Value`;
        const divider = `  ${'-'.repeat(maxName)}  ${'-'.repeat(maxType)}  -----`;
        process.stdout.write(`${header}\n${divider}\n`);

        for (const v of variables) {
            const name = String(v.name ?? '').padEnd(maxName);
            const type = String(v.type ?? '').padEnd(maxType);
            const ref = (v.variablesReference as number) > 0 ? ` [expand ${v.variablesReference}]` : '';
            const value = `${String(v.value ?? '')}${ref}`;
            process.stdout.write(`  ${name}  ${type}  ${value}\n`);
        }
    }

    private printHelp(): void {
        process.stdout.write([
            '',
            'roku-debug CLI commands:',
            '  c, cont, continue        - Resume execution',
            '  n, next                  - Step over (next line)',
            '  s, step, stepin          - Step into function',
            '  o, stepout               - Step out of function',
            '  p, pause                 - Pause execution',
            '  v, vars, variables       - Inspect variables in current scope',
            '  bt, backtrace, stack     - Show the call stack',
            '  expand, ex <ref>         - Expand a nested variable by its reference ID',
            '  e, eval <expr>           - Evaluate an expression in current frame',
            '  h, help                  - Show this help',
            '  q, quit, exit            - Quit the debugger',
            ''
        ].join('\n'));
    }

    private cleanup(): void {
        this.rl?.close();
        this.socket?.destroy();
        this.server?.close();
    }
}

