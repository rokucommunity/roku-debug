import { expect } from 'chai';
import { execSync } from 'child_process';
import { DapMessageParser, formatDapMessage, CliDebugger } from './CliDebugger';

describe('cli', () => {
    it('runs without crashing and includes summary', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('roku-debug, support for debugging Roku devices via telnet or debug protocol');
    });

    it('--help includes --host option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--host');
    });

    it('--help includes --password option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--password');
    });

    it('--help includes --root-dir option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--root-dir');
    });

    it('--help includes --enable-debug-protocol option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--enable-debug-protocol');
    });

    it('--help includes --stop-on-entry option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--stop-on-entry');
    });

    it('--help includes --log-level option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--log-level');
    });

    it('--help includes --dap option', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--dap');
    });

    it('--help includes usage example', function() {
        this.timeout(90_000);
        const output = execSync('npx ts-node src/cli.ts --help').toString();
        expect(output).to.include('--host');
        expect(output).to.include('--password');
    });

    it('--help includes variable inspection commands', function() {
        this.timeout(90_000);
        // Interactive commands appear in CliDebugger.printHelp(), not in the yargs --help.
        // Verify by calling printHelp() directly.
        const { cliDebugger, output, restore } = (function() {
            const inst = new CliDebugger({ host: '127.0.0.1', password: 'test' });
            const captured: string[] = [];
            const origWrite = process.stdout.write.bind(process.stdout);
            const restoreFn = () => {
                (process.stdout as any).write = origWrite;
            };
            (process.stdout as any).write = (chunk: string | Buffer) => {
                captured.push(typeof chunk === 'string' ? chunk : chunk.toString());
                return true;
            };
            return { cliDebugger: inst, output: captured, restore: restoreFn };
        }());
        try {
            (cliDebugger as any).printHelp();
            const combined = output.join('');
            expect(combined).to.include('vars');
            expect(combined).to.include('backtrace');
            expect(combined).to.include('expand');
        } finally {
            restore();
        }
    });
});

describe('DapMessageParser', () => {
    it('parses a single complete DAP message', () => {
        const parser = new DapMessageParser();
        const body = JSON.stringify({ seq: 1, type: 'event', event: 'initialized' });
        const raw = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
        const messages = parser.feed(raw);
        expect(messages).to.have.length(1);
        expect(messages[0]).to.deep.equal({ seq: 1, type: 'event', event: 'initialized' });
    });

    it('parses multiple complete DAP messages fed at once', () => {
        const parser = new DapMessageParser();
        const body1 = JSON.stringify({ seq: 1, type: 'event', event: 'initialized' });
        const body2 = JSON.stringify({ seq: 2, type: 'event', event: 'terminated' });
        const raw =
            `Content-Length: ${Buffer.byteLength(body1, 'utf8')}\r\n\r\n${body1}` +
            `Content-Length: ${Buffer.byteLength(body2, 'utf8')}\r\n\r\n${body2}`;
        const messages = parser.feed(raw);
        expect(messages).to.have.length(2);
        expect(messages[0].event).to.equal('initialized');
        expect(messages[1].event).to.equal('terminated');
    });

    it('handles partial messages across multiple feed calls', () => {
        const parser = new DapMessageParser();
        const body = JSON.stringify({ seq: 1, type: 'event', event: 'initialized' });
        const raw = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
        const mid = Math.floor(raw.length / 2);
        const first = parser.feed(raw.substring(0, mid));
        expect(first).to.have.length(0);
        const second = parser.feed(raw.substring(mid));
        expect(second).to.have.length(1);
        expect(second[0].event).to.equal('initialized');
    });

    it('returns an empty array when no complete message is available', () => {
        const parser = new DapMessageParser();
        const messages = parser.feed('Content-Length: 100\r\n\r\n{');
        expect(messages).to.have.length(0);
    });
});

describe('formatDapMessage', () => {
    it('produces a correctly framed DAP message', () => {
        const msg = { seq: 1, type: 'request', command: 'initialize' };
        const result = formatDapMessage(msg);
        const body = JSON.stringify(msg);
        expect(result).to.equal(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
    });
});

describe('CliDebugger variable inspection', () => {
    /**
     * Builds a CliDebugger and pumps synthetic DAP messages through its internal
     * message-handler, collecting all stdout writes for assertions.
     *
     * This lets us test the variable inspection logic without a real Roku device or
     * a live network connection.
     */
    function buildTestDebugger() {
        const cliDebugger = new CliDebugger({ host: '127.0.0.1', password: 'test' });

        // Capture stdout writes
        const output: string[] = [];
        const origWrite = process.stdout.write.bind(process.stdout);
        const restore = () => {
            (process.stdout as any).write = origWrite;
        };
        (process.stdout as any).write = (chunk: string | Buffer) => {
            output.push(typeof chunk === 'string' ? chunk : chunk.toString());
            return true;
        };

        return { cliDebugger, output, restore };
    }

    it('dispatches a pending-request callback when a matching response arrives', () => {
        const { cliDebugger, restore } = buildTestDebugger();
        try {
            let callbackCalled = false;
            // Register a callback for request_seq 42
            (cliDebugger as any).pendingRequests.set(42, (_response: Record<string, any>) => {
                callbackCalled = true;
            });
            // Feed a matching response
            (cliDebugger as any).handleMessage({ type: 'response', request_seq: 42, success: true, command: 'scopes', body: {} });
            expect(callbackCalled).to.equal(true);
            // Callback should have been removed from the map
            expect((cliDebugger as any).pendingRequests.has(42)).to.equal(false);
        } finally {
            restore();
        }
    });

    it('formats a variable table correctly', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            const vars = [
                { name: 'count', type: 'Integer', value: '42', variablesReference: 0 },
                { name: 'msg', type: 'String', value: '"hello"', variablesReference: 0 }
            ];
            (cliDebugger as any).printVariableTable(vars);
            const combined = output.join('');
            expect(combined).to.include('count');
            expect(combined).to.include('42');
            expect(combined).to.include('msg');
            expect(combined).to.include('"hello"');
            expect(combined).to.include('Integer');
            expect(combined).to.include('String');
        } finally {
            restore();
        }
    });

    it('shows expand hint for variables with nested children', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            const vars = [
                { name: 'obj', type: 'AssocArray', value: '<AssocArray>', variablesReference: 99 }
            ];
            (cliDebugger as any).printVariableTable(vars);
            const combined = output.join('');
            expect(combined).to.include('[expand 99]');
        } finally {
            restore();
        }
    });

    it('does not show expand hint when variablesReference is 0', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            const vars = [
                { name: 'x', type: 'Integer', value: '1', variablesReference: 0 }
            ];
            (cliDebugger as any).printVariableTable(vars);
            const combined = output.join('');
            expect(combined).to.not.include('[expand');
        } finally {
            restore();
        }
    });

    it('stores currentThreadId and currentFrameId when stopped event is processed', () => {
        const { cliDebugger, restore } = buildTestDebugger();
        try {
            // Stub fetchStackTrace to avoid sending real DAP requests
            (cliDebugger as any).fetchStackTrace = (threadId: number, onDone: (frames: any[]) => void) => {
                onDone([{ id: 77, name: 'main', line: 10, source: { path: '/app/main.brs' } }]);
            };
            (cliDebugger as any).onStopped({ reason: 'breakpoint', threadId: 5 });
            expect((cliDebugger as any).currentThreadId).to.equal(5);
            expect((cliDebugger as any).currentFrameId).to.equal(77);
        } finally {
            restore();
        }
    });

    it('commandVariables prints variable names and values', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            (cliDebugger as any).currentFrameId = 1;
            // Stub fetchVariables
            (cliDebugger as any).fetchVariables = (_frameId: number, onDone: (scopeMap: any[]) => void) => {
                onDone([{
                    name: 'Local',
                    variables: [
                        { name: 'x', type: 'Integer', value: '7', variablesReference: 0 }
                    ]
                }]);
            };
            (cliDebugger as any).commandVariables();
            const combined = output.join('');
            expect(combined).to.include('Local');
            expect(combined).to.include('x');
            expect(combined).to.include('7');
        } finally {
            restore();
        }
    });

    it('commandVariables shows message when not at a frame', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            (cliDebugger as any).currentFrameId = undefined;
            (cliDebugger as any).commandVariables();
            const combined = output.join('');
            expect(combined).to.include('Not stopped at a frame');
        } finally {
            restore();
        }
    });

    it('commandBacktrace prints frame names and locations', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            (cliDebugger as any).currentThreadId = 1;
            (cliDebugger as any).fetchStackTrace = (_threadId: number, onDone: (frames: any[]) => void) => {
                onDone([
                    { id: 1, name: 'inner', line: 5, source: { path: '/app/main.brs' } },
                    { id: 2, name: 'outer', line: 20, source: { path: '/app/main.brs' } }
                ]);
            };
            (cliDebugger as any).commandBacktrace();
            const combined = output.join('');
            expect(combined).to.include('inner');
            expect(combined).to.include('outer');
            expect(combined).to.include('#0');
            expect(combined).to.include('#1');
        } finally {
            restore();
        }
    });

    it('commandExpand prints child variable values', () => {
        const { cliDebugger, output, restore } = buildTestDebugger();
        try {
            (cliDebugger as any).fetchChildVariables = (_ref: number, onDone: (vars: any[]) => void) => {
                onDone([{ name: 'key', type: 'String', value: '"val"', variablesReference: 0 }]);
            };
            (cliDebugger as any).commandExpand(99);
            const combined = output.join('');
            expect(combined).to.include('key');
            expect(combined).to.include('"val"');
        } finally {
            restore();
        }
    });
});
