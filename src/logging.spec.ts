import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as sinonActual from 'sinon';
import type { LaunchConfiguration } from './LaunchConfiguration';
import { standardizePath as s } from 'brighterscript';
import type { LogMessage } from './logging';
import { clearSecrets, FileLoggingManager, fileTransport, logger, redactLogMessage, registerSecret } from './logging';

const sinon = sinonActual.createSandbox();
const tempDir = s`${__dirname}/../../.tmp`;

describe('logging secret masking', () => {
    function buildMessage(...args: any[]) {
        return logger['buildLogMessage']('log', ...args) as LogMessage;
    }

    beforeEach(() => {
        clearSecrets();
    });

    afterEach(() => {
        clearSecrets();
    });

    describe('redactLogMessage', () => {
        it('returns the original message untouched when it holds no registered secret', () => {
            registerSecret('dev-password');
            for (const message of [
                buildMessage('connect', { host: '1.2.3.4', password: 'other' }),
                buildMessage('the password was wrong'),
                buildMessage('buffer', Buffer.from('a'))
            ]) {
                expect(redactLogMessage(message)).to.equal(message);
            }
        });

        it('masks a secret wherever it appears, whatever the key', () => {
            registerSecret('dev-password');
            registerSecret('rce-token');
            const message = redactLogMessage(buildMessage(
                'connect',
                { pw: 'dev-password', device: { id: 83, someOtherName: 'rce-token' } },
                'https://example.com?token=rce-token',
                new Error('bad password dev-password')
            ));
            expect(message.argsText).not.to.include('dev-password');
            expect(message.argsText).not.to.include('rce-token');
            expect(message.argsText).to.include('{"pw":"<redacted>","device":{"id":83,"someOtherName":"<redacted>"}}');
            expect(message.argsText).to.include('https://example.com?token=<redacted>');
            //raw args are replaced so transports that print them (i.e. the console) can't leak the secret
            expect(message.args).to.eql([message.argsText]);
        });

        it('masks a secret whose JSON form is escaped', () => {
            registerSecret('pa"ss\\word');
            const message = redactLogMessage(buildMessage({ password: 'pa"ss\\word' }, 'raw pa"ss\\word'));
            expect(message.argsText).to.equal('{"password":"<redacted>"} raw <redacted>');
        });

        it('masks the longer of two overlapping secrets whole', () => {
            registerSecret('abc');
            registerSecret('abcdef');
            expect(redactLogMessage(buildMessage('abcdef abc')).argsText).to.equal('<redacted> <redacted>');
        });

        it('ignores empty and non-string values', () => {
            registerSecret('');
            registerSecret(undefined);
            registerSecret(1234);
            const message = buildMessage('nothing 1234');
            expect(redactLogMessage(message)).to.equal(message);
        });
    });

    it('masks secrets in every message logged by any descendant logger', () => {
        registerSecret('dev-password');
        const messages: LogMessage[] = [];
        const unsubscribe = logger.subscribe((message) => messages.push(message));
        try {
            const child = logger.createLogger('[child]').createLogger('[grandchild]');
            child.logLevel = 'log';
            child.log('connect', { host: '1.2.3.4', password: 'dev-password' });
            child.log('nothing secret', { host: '1.2.3.4' });

            expect(messages[0].argsText).to.equal('connect {"host":"1.2.3.4","password":"<redacted>"}');
            expect(messages[1].argsText).to.equal('nothing secret {"host":"1.2.3.4"}');
        } finally {
            unsubscribe();
        }
    });

    describe('performance', () => {
        /**
         * Run `action` `iterations` times (after a warmup) and return the elapsed milliseconds
         */
        function time(iterations: number, action: () => void) {
            for (let i = 0; i < 5; i++) {
                action();
            }
            const start = process.hrtime.bigint();
            for (let i = 0; i < iterations; i++) {
                action();
            }
            return Number(process.hrtime.bigint() - start) / 1e6;
        }

        //a large, realistic, credential-free payload (think: a variables response or breakpoint list)
        const largeCleanPayload = Array.from({ length: 2_000 }, (_, i) => ({
            id: i,
            name: `variable${i}`,
            type: 'roAssociativeArray',
            value: `some value ${i}`,
            children: [{ key: 'a', line: i }, { key: 'b', column: i }]
        }));

        beforeEach(() => {
            registerSecret('dev-password');
            registerSecret('a-long-rce-token-value-1234567890');
        });

        it('never touches the args of a message holding no secret', () => {
            const message = buildMessage('variables', largeCleanPayload);
            //any enumeration or property read of the args would throw
            const trap = () => {
                throw new Error('args were walked');
            };
            message.args = [new Proxy({}, { ownKeys: trap, get: trap, getOwnPropertyDescriptor: trap })];
            expect(redactLogMessage(message)).to.equal(message);
        });

        it('costs a small fraction of the stringify that logging already does', () => {
            const message = buildMessage('variables', largeCleanPayload);
            const stringifyMs = time(50, () => logger.stringifyArgs(message.args));
            const redactMs = time(50, () => redactLogMessage(message));
            expect(redactMs).to.be.lessThan(stringifyMs * 0.25, `redact took ${redactMs}ms vs stringify ${stringifyMs}ms`);
        });

        it('scales linearly with message size', () => {
            const small = buildMessage('x'.repeat(100_000));
            const large = buildMessage('x'.repeat(1_000_000));
            const smallMs = time(20, () => redactLogMessage(small));
            const largeMs = time(20, () => redactLogMessage(large));
            //10x the input should take ~10x the time; allow generous slack for timer noise
            expect(largeMs).to.be.lessThan(Math.max(smallMs, 1) * 30, `10x input took ${largeMs}ms vs ${smallMs}ms`);
        });
    });
});

describe('LoggingManager', () => {
    let manager: FileLoggingManager;

    beforeEach(() => {
        fsExtra.emptydirSync(tempDir);
        sinon.restore();
        manager = new FileLoggingManager();
        //register a writer that discards all log output
        fileTransport.setWriter(() => { });
    });

    afterEach(() => {
        fsExtra.emptydirSync(tempDir);
        sinon.restore();
    });

    describe('configure', () => {
        function configure(config: Partial<LaunchConfiguration['fileLogging']>, cwd?: string) {
            manager.activate(config as any, cwd);
        }
        it('disables when not specified', () => {
            configure(undefined);
            expect(manager['fileLogging'].rokuDevice.enabled).to.be.false;
            expect(manager['fileLogging'].debugger.enabled).to.be.false;
        });

        it('disables when set to disabled', () => {
            configure({
                enabled: false
            });
            expect(manager['fileLogging'].rokuDevice.enabled).to.be.false;
            expect(manager['fileLogging'].debugger.enabled).to.be.false;
        });

        it('enables both when set to true', () => {
            configure({
                enabled: true
            });
            expect(manager['fileLogging'].rokuDevice.enabled).to.be.true;
            expect(manager['fileLogging'].debugger.enabled).to.be.true;
        });

        it('disables one when explicitly disabled', () => {
            configure({
                rokuDevice: false
            });
            expect(manager['fileLogging'].rokuDevice.enabled).to.be.false;
            expect(manager['fileLogging'].debugger.enabled).to.be.true;

            configure({
                debugger: false
            });
            expect(manager['fileLogging'].rokuDevice.enabled).to.be.true;
            expect(manager['fileLogging'].debugger.enabled).to.be.false;
        });

        it('uses logfile path when specified and mode="append"', () => {
            configure({
                rokuDevice: {
                    filename: 'telnet.log',
                    mode: 'append'
                },
                debugger: {
                    filename: 'dbg.log',
                    mode: 'append'
                }
            }, tempDir);
            expect(
                manager['fileLogging'].rokuDevice.filePath
            ).to.eql(
                s`${tempDir}/logs/telnet.log`
            );
            expect(
                manager['fileLogging'].debugger.filePath
            ).to.eql(
                s`${tempDir}/logs/dbg.log`
            );
        });

        it('generates a rolling logfile when specified as session', () => {
            let dateText = manager['getLogDate'](new Date());
            sinon.stub(manager as any, 'getLogDate').callsFake((...args) => {
                return dateText;
            });
            configure({
                rokuDevice: true
            }, tempDir);
            expect(
                manager['fileLogging'].rokuDevice.filePath
            ).to.eql(
                s`${tempDir}/logs/${dateText}-rokuDevice.log`
            );
        });

        it('uses default dir when not specified', () => {
            let dateText = manager['getLogDate'](new Date());
            sinon.stub(manager as any, 'getLogDate').callsFake((...args) => {
                return dateText;
            });
            configure(true, tempDir);
            expect(
                manager['fileLogging'].rokuDevice.filePath
            ).to.eql(
                s`${tempDir}/logs/${dateText}-rokuDevice.log`
            );
            expect(
                manager['fileLogging'].debugger.filePath
            ).to.eql(
                s`${tempDir}/logs/${dateText}-debugger.log`
            );
        });

        it('uses root-level dir when specified', () => {
            let dateText = manager['getLogDate'](new Date());
            sinon.stub(manager as any, 'getLogDate').callsFake((...args) => {
                return dateText;
            });
            configure({
                dir: s`${tempDir}/logs2`
            }, tempDir);
            expect(
                manager['fileLogging'].rokuDevice.filePath
            ).to.eql(
                s`${tempDir}/logs2/${dateText}-rokuDevice.log`
            );
            expect(
                manager['fileLogging'].debugger.filePath
            ).to.eql(
                s`${tempDir}/logs2/${dateText}-debugger.log`
            );
        });

        it('uses log-type level dir when specified', () => {
            let dateText = manager['getLogDate'](new Date());
            sinon.stub(manager as any, 'getLogDate').callsFake((...args) => {
                return dateText;
            });
            configure({
                rokuDevice: {
                    dir: s`${tempDir}/one`
                },
                debugger: {
                    dir: s`${tempDir}/two`
                }
            }, tempDir);
            expect(
                manager['fileLogging'].rokuDevice.filePath
            ).to.eql(
                s`${tempDir}/one/${dateText}-rokuDevice.log`
            );
            expect(
                manager['fileLogging'].debugger.filePath
            ).to.eql(
                s`${tempDir}/two/${dateText}-debugger.log`
            );
        });

        it('uses log-type level dir when specified', () => {
            let dateText = manager['getLogDate'](new Date());
            sinon.stub(manager as any, 'getLogDate').callsFake((...args) => {
                return dateText;
            });
            configure({
                rokuDevice: {
                    dir: s`${tempDir}/one`
                },
                debugger: {
                    dir: s`${tempDir}/two`
                }
            }, tempDir);
            expect(
                manager['fileLogging'].rokuDevice.filePath
            ).to.eql(
                s`${tempDir}/one/${dateText}-rokuDevice.log`
            );
            expect(
                manager['fileLogging'].debugger.filePath
            ).to.eql(
                s`${tempDir}/two/${dateText}-debugger.log`
            );
        });
    });

    describe('pruneLogDir', () => {
        let logsDir = s`${tempDir}/logs`;
        beforeEach(() => {
            fsExtra.ensureDirSync(logsDir);
        });

        function writeLogs(dir, filename: string, count: number) {
            const paths: string[] = [];
            let startDate = new Date();
            for (let i = 0; i < count; i++) {
                startDate.setSeconds(startDate.getSeconds() + 1);

                paths.push(
                    s`${dir}/${manager['getLogDate'](startDate)}-${filename}`
                );
                fsExtra.writeFileSync(paths[paths.length - 1], '');
            }
            return paths;
        }

        it('does not crash when no files were found', () => {
            expect(
                manager['pruneLogDir'](logsDir, 'log.log', 100)
            ).to.eql([]);
        });

        it('does not delete matching files when under the max', () => {
            const paths = writeLogs(logsDir, 'rokuDevice.log', 5);
            expect(
                manager['pruneLogDir'](logsDir, 'rokuDevice.log', 10)
                //empty array means no files were deleted
            ).to.eql([]);
        });

        it('prunes the oldest files when over the max', () => {
            const paths = writeLogs(logsDir, 'rokuDevice.log', 5);
            expect(
                manager['pruneLogDir'](logsDir, 'rokuDevice.log', 2)
            ).to.eql([
                paths[0],
                paths[1]
            ]);
            expect(fsExtra.pathExistsSync(paths[0])).to.be.false;
            expect(fsExtra.pathExistsSync(paths[1])).to.be.false;
        });

        it('does not prune when having exactly max number', () => {
            const paths = writeLogs(logsDir, 'rokuDevice.log', 5);
            expect(
                manager['pruneLogDir'](logsDir, 'rokuDevice.log', 5)
                //empty array means no files were deleted
            ).to.eql([]);
        });
    });
});
