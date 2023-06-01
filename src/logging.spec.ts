import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as sinonActual from 'sinon';
import type { LaunchConfiguration } from './LaunchConfiguration';
import { standardizePath as s } from 'brighterscript';
import { FileLoggingManager, fileTransport } from './logging';

const sinon = sinonActual.createSandbox();
const tempDir = s`${__dirname}/../../.tmp`;

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
