import { expect } from 'chai';
import { execSync } from 'child_process';
import { DapMessageParser, formatDapMessage } from './CliDebugger';

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
