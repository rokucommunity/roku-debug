import { expect } from 'chai';
import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import * as path from 'path';

describe('cli', () => {
    let child: ChildProcess;
    afterEach(() => {
        child?.kill();
        child = undefined;
    });

    it('runs without crashing and includes summary', function() {
        this.timeout(90_000);
        expect(
            execSync('npx ts-node src/cli.ts --help').toString()
        ).to.include('roku-debug, support for debugging Roku devices via telnet or debug protocol');
    });

    it('writes only DAP messages to stdout in --dap mode', async function() {
        this.timeout(90_000);
        child = spawn(process.execPath, ['--require', 'ts-node/register', 'src/cli.ts', '--dap'], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env, TS_NODE_TRANSPILE_ONLY: 'true' }
        });
        let stdout = '';
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        const gotInitializeResponse = new Promise<void>((resolve, reject) => {
            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
                if (stdout.includes('"command":"initialize"')) {
                    resolve();
                }
            });
            child.on('exit', (code) => reject(new Error(`cli exited early with code ${code}.\n${stderr}`)));
        });

        //initializeRequest logs before responding, so this request triggers the log output that used to corrupt stdout
        const body = JSON.stringify({ seq: 1, type: 'request', command: 'initialize', arguments: { adapterID: 'brightscript', pathFormat: 'path', linesStartAt1: true, columnsStartAt1: true } });
        child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
        await gotInitializeResponse;

        //every byte on stdout must belong to a `Content-Length` framed message
        let remaining = Buffer.from(stdout);
        while (remaining.length > 0) {
            const match = /^Content-Length: (\d+)\r\n\r\n/.exec(remaining.toString());
            expect(match, `unexpected non-DAP stdout: ${JSON.stringify(remaining.toString())}`).to.exist;
            const headerLength = Buffer.byteLength(match[0]);
            const length = parseInt(match[1]);
            JSON.parse(remaining.subarray(headerLength, headerLength + length).toString());
            remaining = remaining.subarray(headerLength + length);
        }
    });
});
