import { expect } from 'chai';
import { TelnetAdapter } from './TelnetAdapter';
import * as dedent from 'dedent';
import { EventEmitter } from 'events';
import { HighLevelType } from '../interfaces';
import { RendezvousTracker } from '../RendezvousTracker';
import type { LaunchConfiguration } from '../LaunchConfiguration';
import type { EvaluateContainer } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import { rokuDeploy } from 'roku-deploy';
import type { SocketOptions } from 'roku-deploy';
import type { SinonStub } from 'sinon';

const sinon = createSandbox();

/**
 * Minimal fake standing in for roku-deploy's RokuDeploySocket. A real RokuDeploySocket is itself an
 * EventEmitter ('connect'|'ready'|'data'|'close'|'error', ...), so extending Node's EventEmitter
 * directly gives correct on/removeListener/emit semantics. TelnetAdapter never hands this to
 * telnet-client (that is only SceneGraphDebugCommandController's concern), so it does not need to
 * satisfy telnet-client's `_checkSocket()` stream-internals requirements.
 */
class FakeRokuDeploySocket extends EventEmitter {
    public writtenChunks: Array<string | Buffer> = [];

    public destroyed = false;

    /**
     * Mirrors RokuDeploySocket#connect(): emits 'connect' then 'ready', then invokes the connect
     * listener, exactly like net.Socket does.
     */
    public connect(connectListener?: () => void): this {
        this.emit('connect');
        this.emit('ready');
        connectListener?.();
        return this;
    }

    public write(data: string | Buffer): boolean {
        this.writtenChunks.push(data);
        return true;
    }

    public destroy(): this {
        this.destroyed = true;
        this.emit('close');
        return this;
    }
}

describe('TelnetAdapter ', () => {
    let adapter: TelnetAdapter;
    let launchConfig = {
        'host': '192.168.1.5',
        'remotePort': 8060
    };
    let deviceInfo = {
        softwareVersion: '11.5.0'
    };
    let rendezvousTracker = new RendezvousTracker(deviceInfo, launchConfig as any);

    beforeEach(() => {
        adapter = new TelnetAdapter(
            {
                device: { host: '127.0.0.1' }
            },
            rendezvousTracker
        );
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getHighLevelTypeDetails', () => {
        it('works', () => {
            expect(adapter['getObjectType']('<Component: roAssociativeArray>')).to.equal('roAssociativeArray');
            expect(adapter['getObjectType']('<Component: roInvalid>')).to.equal('roInvalid');
            expect(adapter['getObjectType']('<Component: roSGNode:ContentNode>')).to.equal('roSGNode:ContentNode');
        });
    });

    // disable:no-trailing-whitespace disable for this test because trailing whitespace matters
    describe('getForLoopPrintedChildren', () => {
        it('finds the proper number of children', () => {
            expect(adapter['getForLoopPrintedChildren']('arr', `
                vscode_is_string:falsetrue
                vscode_is_string:falsefalse
                vscode_is_string:truecat
                vscode_is_string:truecat
                vscode_is_string:true
                vscode_is_string:true
            `).length).to.equal(6);
        });
        it('handles basic arrays', () => {
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:Float:vscode_type_stop vscode_is_string:false 1.1 `)[0]).to.deep.include(<EvaluateContainer>{
                name: '0',
                evaluateName: 'arr[0]',
                type: 'Float',
                value: '1.1'
            });
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:Boolean:vscode_type_stop vscode_is_string:falsetrue`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'Boolean',
                value: 'true'
            });
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:Boolean:vscode_type_stop vscode_is_string:falsefalse`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'Boolean',
                value: 'false'
            });
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:trueTrailingSpace `)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"TrailingSpace "'
            });
            //empty string
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '""'
            });
            //whitespace-only string
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true `)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '" "'
            });
        });

        it('handles newlines in strings', () => {
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true\n`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"\n"'
            });
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:trueRoku\n`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"Roku\n"'
            });
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:true\nRoku`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"\nRoku"'
            });
            expect(adapter['getForLoopPrintedChildren']('arr', `vscode_type_start:String:vscode_type_stop vscode_is_string:trueRoku\nRoku`)[0]).to.deep.include(<EvaluateContainer>{
                type: 'String',
                value: '"Roku\nRoku"'
            });
        });

        it('skips empty lines', () => {
            //not sure when this would happen in reality, but test it just in case
            expect(adapter['getForLoopPrintedChildren']('testNode', `
                vscode_key_start:focusable:vscode_key_stop vscode_is_string:falsefalse

                vscode_key_start:id:vscode_key_stop vscode_is_string:true
            `)).to.be.lengthOf(2);
        });

        it('handles lists larger than 100', () => {

        });

        it('does not include an extra newline for the last item when it is a string', () => {
            const variables = adapter['getForLoopPrintedChildren']('testNode',
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld'
            );
            expect(variables.find(x => x.name === 'message1').value).to.equal('"Hello"');
            expect(variables.find(x => x.name === 'message2').value).to.equal('"World"');
        });

        it('handles nodes with nested arrays', () => {
            const variables = adapter['getForLoopPrintedChildren']('testNode', dedent`
                vscode_key_start:change:vscode_key_stop vscode_is_string:false<Component: roAssociativeArray> =
                {
                    Index1: 0
                    Index2: 0
                    Operation: "none"
                }
                vscode_key_start:EDID:vscode_key_stop vscode_is_string:false<Component: roByteArray> =
                [
                    0
                    ...
                ]
                vscode_key_start:focusable:vscode_key_stop vscode_type_start:Boolean:vscode_type_stop vscode_is_string:falsefalse
                vscode_key_start:focusedChild:vscode_key_stop vscode_is_string:false<Component: roInvalid>
                vscode_key_start:id:vscode_key_stop vscode_type_start:String:vscode_type_stop vscode_is_string:true
                vscode_key_start:mynewfield:vscode_key_stop vscode_is_string:false<Component: roSGNode:ContentNode> =
                {
                    change: <Component: roAssociativeArray>
                    focusable: false
                    focusedChild: <Component: roInvalid>
                    id: ""
                    TITLE: "Node Three"
                }
            `);
            expect(variables).to.eql([{
                name: 'change',
                evaluateName: 'testNode["change"]',
                highLevelType: 'object',
                type: 'roAssociativeArray',
                children: []
            }, {
                name: 'EDID',
                evaluateName: 'testNode["EDID"]',
                type: 'roByteArray',
                //children of EDID should be null because we encountered the elipses (...) which means it should be evaluated later
                children: [],
                highLevelType: 'array'
            }, {
                evaluateName: 'testNode["focusable"]',
                type: 'Boolean',
                value: 'false',
                name: 'focusable',
                children: undefined,
                highLevelType: 'primative'
            }, {
                evaluateName: 'testNode["focusedChild"]',
                name: 'focusedChild',
                type: 'roInvalid',
                value: 'roInvalid',
                children: undefined,
                highLevelType: HighLevelType.uninitialized
            }, {
                evaluateName: 'testNode["id"]',
                name: 'id',
                type: 'String',
                value: '""',
                children: undefined,
                highLevelType: 'primative'
            }, {
                evaluateName: 'testNode["mynewfield"]',
                type: 'roSGNode:ContentNode',
                name: 'mynewfield',
                children: [],
                highLevelType: 'object'
            }]);
        });
    });

    describe('checkForRuntimeError', () => {
        let emitStub: SinonStub;

        beforeEach(() => {
            emitStub = sinon.stub(adapter as any, 'emit');
        });

        function check(text: string) {
            return adapter['checkForRuntimeError'](text) as boolean;
        }

        function expectError(text: string, message: string, errorCode: string) {
            expect(check(text)).to.be.true;
            expect(emitStub.callCount).to.equal(1);
            expect(emitStub.firstCall.args).to.eql(['runtime-error', { message: message, errorCode: errorCode }]);
        }

        function expectNoError(text: string) {
            expect(check(text)).to.be.false;
            expect(emitStub.called).to.be.false;
        }

        it('detects a basic runtime error', () => {
            expectError(
                `Divide by Zero. (runtime error &h14) in pkg:/source/main.brs(12)`,
                'Divide by Zero.',
                '&h14'
            );
        });

        it('detects a runtime error whose message contains parens and quotes', () => {
            expectError(
                `Type Mismatch. Operator "+" can't be applied to "String" and "Integer". (runtime error &h18) in pkg:/source/main.brs(5)`,
                `Type Mismatch. Operator "+" can't be applied to "String" and "Integer".`,
                '&h18'
            );
        });

        it('lowercases the error code', () => {
            expectError(
                `Divide by Zero. (runtime error &H14) in pkg:/source/main.brs(12)`,
                'Divide by Zero.',
                '&h14'
            );
        });

        it('allows extra whitespace between the keywords', () => {
            expectError(
                `Divide by Zero. (runtime   error \t &h14)   in pkg:/source/main.brs(12)`,
                'Divide by Zero.',
                '&h14'
            );
        });

        it('detects a runtime error surrounded by other lines', () => {
            expectError(
                [
                    '------ Running dev \'app\' main ------',
                    'some log line',
                    'Divide by Zero. (runtime error &h14) in pkg:/source/main.brs(12)',
                    '012: print 1/0',
                    'Backtrace:',
                    '#0  Function main() As Void',
                    'Brightscript Debugger>'
                ].join('\n'),
                'Divide by Zero.',
                '&h14'
            );
        });

        it('detects a runtime error with CRLF line endings', () => {
            expectError(
                'some log line\r\nDivide by Zero. (runtime error &h14) in pkg:/source/main.brs(12)\r\n012: print 1/0\r\n',
                'Divide by Zero.',
                '&h14'
            );
        });

        it('detects a runtime error when the message is on the previous line', () => {
            expectError(
                'first\nDivide by Zero.\n(runtime error &h14) in pkg:/source/main.brs(12)',
                'Divide by Zero.',
                '&h14'
            );
        });

        it('detects a runtime error when "in" is on the next line', () => {
            expectError(
                'Divide by Zero. (runtime error &h14)\nin pkg:/source/main.brs(12)',
                'Divide by Zero.',
                '&h14'
            );
        });

        it('detects a runtime error with an empty message at the start of the text', () => {
            expectError(
                ' (runtime error &h14) in pkg:/source/main.brs(12)',
                '',
                '&h14'
            );
        });

        it('reports the first runtime error when there are several on different lines', () => {
            expectError(
                [
                    'Divide by Zero. (runtime error &h14) in pkg:/source/main.brs(12)',
                    'Type Mismatch. (runtime error &h18) in pkg:/source/main.brs(5)'
                ].join('\n'),
                'Divide by Zero.',
                '&h14'
            );
        });

        it('uses the same capture groups as before when one line contains several runtime errors', () => {
            //the greedy capture groups grab as much of the line as possible
            expectError(
                'A. (runtime error &h14) in x B. (runtime error &h18) in y',
                'A. (runtime error &h14) in x B.',
                '&h18'
            );
        });

        it('skips a line that has "(runtime error" but no " in" and finds a later one', () => {
            expectError(
                [
                    'Nope. (runtime error &h14) at pkg:/source/main.brs(12)',
                    'Divide by Zero. (runtime error &h18) in pkg:/source/main.brs(12)'
                ].join('\n'),
                'Divide by Zero.',
                '&h18'
            );
        });

        it('ignores STOP (&hf7)', () => {
            expectNoError(`STOP (runtime error &hf7) in pkg:/source/main.brs(3)`);
        });

        it('ignores scriptBreak() (&hf8)', () => {
            expectNoError(`BREAK (runtime error &hF8) in pkg:/source/main.brs(3)`);
        });

        it('returns false for regular output', () => {
            expectNoError('');
            expectNoError('hello world');
            expectNoError('------ Running dev \'app\' main ------\nBrightscript Debugger>');
        });

        it('returns false for near misses', () => {
            //no parens
            expectNoError('runtime error &h14 in pkg:/source/main.brs(12)');
            //no whitespace before the paren
            expectNoError('Divide by Zero.(runtime error &h14) in pkg:/source/main.brs(12)');
            //no closing paren
            expectNoError('Divide by Zero. (runtime error &h14 in pkg:/source/main.brs(12)');
            //no " in"
            expectNoError('Divide by Zero. (runtime error &h14) at pkg:/source/main.brs(12)');
            //case sensitive
            expectNoError('Divide by Zero. (Runtime Error &h14) in pkg:/source/main.brs(12)');
            //closing paren is on a different line
            expectNoError('Divide by Zero. (runtime error &h14\n) in pkg:/source/main.brs(12)');
        });

        it('matches the original regex on a wide range of generated inputs', () => {
            //the original implementation. The new one must produce identical results.
            const original = /(.*)\s\(runtime\s+error\s+(.*)\)\s+in/;
            const pieces = [
                'a', 'Divide by Zero.', ' ', '  ', '\t', '\n', '\r\n', '\r', String.fromCharCode(0x2028), '(', ')', ' in', 'in', 'x',
                '(runtime', ' (runtime', 'runtime', ' error', 'error', ' &h14', '&hF7', '&hf8', ') in', ')\nin',
                ' (runtime error &h14) in', ' (runtime error &hf7) in', ' (runtime  error\n&h18)\n in'
            ];
            //simple deterministic PRNG so failures are reproducible
            let seed = 12345;
            const random = () => {
                seed = (seed * 1103515245 + 12345) % 2147483648;
                return seed / 2147483648;
            };
            let matchCount = 0;
            for (let i = 0; i < 20_000; i++) {
                let text = '';
                const count = Math.floor(random() * 12);
                for (let j = 0; j < count; j++) {
                    text += pieces[Math.floor(random() * pieces.length)];
                }

                emitStub.resetHistory();
                const match = original.exec(text);
                let expected: any;
                if (!match) {
                    expected = { result: false, emitted: undefined };
                } else {
                    const errorCode = match[2].trim().toLowerCase();
                    if (errorCode === '&hf7' || errorCode === '&hf8') {
                        expected = { result: false, emitted: undefined };
                    } else {
                        matchCount++;
                        expected = { result: true, emitted: ['runtime-error', { message: match[1].trim(), errorCode: errorCode }] };
                    }
                }
                const result = check(text);
                expect(
                    { result: result, emitted: emitStub.firstCall?.args },
                    JSON.stringify(text)
                ).to.eql(expected);
            }
            //sanity check that the generator actually produced a meaningful number of matches
            expect(matchCount).to.be.greaterThan(500);
        });

        //https://github.com/rokucommunity/roku-debug/issues/440
        describe('performance on very long lines', () => {
            //the Roku Advertising Framework prints a ~68KB single line on sideloaded builds
            const longLine = 'key: value '.repeat(Math.ceil(68_000 / 11)).slice(0, 68_000);

            function time(fn: () => void) {
                const start = process.hrtime.bigint();
                fn();
                return Number(process.hrtime.bigint() - start) / 1e6;
            }

            it('handles a long line with no runtime error quickly', () => {
                const ms = time(() => {
                    expectNoError(longLine);
                });
                expect(ms).to.be.lessThan(100);
            });

            it('handles many long lines with no runtime error quickly', () => {
                const ms = time(() => {
                    expectNoError(`${longLine}\n${longLine}\n${longLine}\n${longLine}`);
                });
                expect(ms).to.be.lessThan(100);
            });

            it('handles a long line with a runtime error at the end quickly', () => {
                const ms = time(() => {
                    expectError(
                        `${longLine}\n${longLine} Divide by Zero. (runtime error &h14) in pkg:/source/main.brs(12)`,
                        `${longLine} Divide by Zero.`,
                        '&h14'
                    );
                });
                expect(ms).to.be.lessThan(100);
            });

            it('handles a long line containing an incomplete runtime error quickly', () => {
                const ms = time(() => {
                    expectNoError(`${longLine} (runtime error &h14 ${longLine}`);
                });
                expect(ms).to.be.lessThan(100);
            });
        });
    });

    describe('after destroy()', () => {
        //Regression tests for https://github.com/rokucommunity/roku-debug/issues/348
        //destroy() nulls out this.cache, so any subsequent call routed through resolve()
        //would crash with `Cannot read properties of undefined (reading '<key>')`.

        beforeEach(() => {
            //force the "debugger is paused" guard to pass so we reach resolve()
            adapter['isAtDebuggerPrompt'] = true;
        });

        it('getThreads() does not throw "Cannot read properties of undefined"', async () => {
            await adapter.destroy();

            let error: Error | undefined;
            try {
                await adapter.getThreads();
            } catch (e) {
                error = e as Error;
            }
            expect(error?.message ?? '').not.to.match(/Cannot read properties of undefined/);
        });

        it('getStackTrace() does not throw "Cannot read properties of undefined"', async () => {
            await adapter.destroy();

            let error: Error | undefined;
            try {
                await adapter.getStackTrace();
            } catch (e) {
                error = e as Error;
            }
            expect(error?.message ?? '').not.to.match(/Cannot read properties of undefined/);
        });

        it('getScopeVariables() does not throw "Cannot read properties of undefined"', async () => {
            await adapter.destroy();

            let error: Error | undefined;
            try {
                await adapter.getScopeVariables();
            } catch (e) {
                error = e as Error;
            }
            expect(error?.message ?? '').not.to.match(/Cannot read properties of undefined/);
        });

        it('getVariableType() does not throw "Cannot read properties of undefined"', async () => {
            await adapter.destroy();

            let error: Error | undefined;
            try {
                await adapter.getVariableType('foo');
            } catch (e) {
                error = e as Error;
            }
            expect(error?.message ?? '').not.to.match(/Cannot read properties of undefined/);
        });
    });

    describe('connect', () => {
        it('does not crash and triggers shutdown when the connection errors after it is established', async () => {
            // Stub keyPress so we don't need a real device
            sinon.stub(rokuDeploy, 'keyPress').resolves();
            // Inject a fake telnet socket instead of opening a real one
            const fakeRokuDeploySocket = new FakeRokuDeploySocket();
            sinon.stub(adapter as any, 'createRokuDeploySocket').returns(fakeRokuDeploySocket);
            // Stub the settle method so connect() completes immediately
            sinon.stub(adapter as any, 'settleTelnetConnection').resolves('');

            await adapter.connect();

            // Wire up a promise that resolves when the adapter emits 'close'. This must be
            // set up before the error is emitted, since a real socket always emits 'close'
            // after a transport error. TelnetAdapter.emit() defers via setTimeout(0), so we
            // await the promise rather than doing a fixed sleep.
            const closePromise = new Promise<void>(resolve => {
                adapter.on('close', resolve);
            });

            // The deferred is now resolved. Emitting an error on the still-live socket
            // (simulating ETIMEDOUT on device disconnect) must not throw, because the adapter
            // is required to keep an 'error' listener attached to the socket at all times.
            expect(() => {
                fakeRokuDeploySocket.emit('error', new Error('read ETIMEDOUT'));
            }).not.to.throw();

            // On a real connected socket Node.js automatically fires 'close' after 'error'.
            // Our fake replicates that here.
            fakeRokuDeploySocket.emit('close');

            // TelnetAdapter.emit() wraps every event in setTimeout(0). Awaiting closePromise
            // yields back to the event loop so that deferred callback can run, confirming
            // the full error -> close -> session-teardown chain fired correctly.
            await closePromise;
        });

        it('passes the configured device and port to the telnet socket factory', async () => {
            const rceDevice = { instanceUrl: 'https://device.rce.roku.com/instance/abc', rceToken: 'token-value' };
            const rceAdapter = new TelnetAdapter(
                {
                    device: rceDevice,
                    brightScriptConsolePort: 8085
                },
                rendezvousTracker
            );
            sinon.stub(rokuDeploy, 'keyPress').resolves();
            sinon.stub(rceAdapter as any, 'settleTelnetConnection').resolves('');
            const fakeRokuDeploySocket = new FakeRokuDeploySocket();
            const createRokuDeploySocketStub = sinon.stub(rceAdapter as any, 'createRokuDeploySocket').returns(fakeRokuDeploySocket);

            await rceAdapter.connect();

            expect(createRokuDeploySocketStub.calledOnce).to.be.true;
            const options: SocketOptions = createRokuDeploySocketStub.firstCall.args[0];
            expect(options).to.eql({
                device: rceDevice,
                port: 8085
            });
        });

        it('passes the configured local device config to the telnet socket factory', async () => {
            sinon.stub(rokuDeploy, 'keyPress').resolves();
            sinon.stub(adapter as any, 'settleTelnetConnection').resolves('');
            const fakeRokuDeploySocket = new FakeRokuDeploySocket();
            const createRokuDeploySocketStub = sinon.stub(adapter as any, 'createRokuDeploySocket').returns(fakeRokuDeploySocket);

            await adapter.connect();

            expect(createRokuDeploySocketStub.calledOnce).to.be.true;
            const options: SocketOptions = createRokuDeploySocketStub.firstCall.args[0];
            expect(options).to.eql({
                device: { host: '127.0.0.1' },
                port: 8085
            });
        });
    });
});
