import { createSandbox } from 'sinon';
const sinon = createSandbox();
import { assert, expect } from 'chai';
import type { RendezvousHistory } from './RendezvousTracker';
import { RendezvousTracker } from './RendezvousTracker';
import { SceneGraphDebugCommandController } from './SceneGraphDebugCommandController';
import type { LaunchConfiguration } from './LaunchConfiguration';

describe('BrightScriptFileUtils ', () => {
    let rendezvousTracker: RendezvousTracker;
    let rendezvousTrackerMock;
    let logString: string;
    let expectedHistory: RendezvousHistory;

    beforeEach(() => {
        let launchConfig = {
            'host': '192.168.1.5',
            'remotePort': 8060
        };
        let deviceInfo = {
            softwareVersion: '11.5.0'
        };
        rendezvousTracker = new RendezvousTracker(deviceInfo, launchConfig as any);
        rendezvousTracker.registerSourceLocator(async (debuggerPath: string, lineNumber: number) => {
            //remove preceding pkg:
            if (debuggerPath.toLowerCase().startsWith('pkg:')) {
                debuggerPath = debuggerPath.substring(4);
            }

            if (debuggerPath === 'NetworkService2.brs') {
                // test checking for xml file if brs was not found
                debuggerPath = '';
            }
            return Promise.resolve({
                filePath: debuggerPath,
                lineNumber: lineNumber,
                columnIndex: 0
            });
        });
        rendezvousTrackerMock = sinon.mock(rendezvousTracker);

        // regex and examples also available at: https://regex101.com/r/In0t7d/6
        logString = `channel: Start
            06-18 19:06:19.810 [sg.node.BLOCK] Rendezvous[3168] at pkg:/components/Modules/Analytics/Video/VideoTracking/Tasks/VHLVideoTrackingTask.brs(126)
            06-18 19:06:19.822 [sg.node.UNBLOCK] Rendezvous[3168] completed in 0.008 s
            06-18 19:06:20.179 [sg.node.BLOCK] Rendezvous[3169] at pkg:/components/Tasks/UriFetcher/UriFetcher.brs(57)
            06-18 19:06:20.189 [sg.node.UNBLOCK] Rendezvous[3169] completed in 0.008 s
            06-18 19:06:20.197 [sg.node.BLOCK] Rendezvous[3170] at pkg:/components/Tasks/UriFetcher/UriFetcher.brs(168)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[3170] completed in 0.008 s
            06-19 15:16:05.629 [sg.node.BLOCK] Rendezvous[25522] at roku_analytics:/components/AnalyticsUtils.brs(221)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[25522] completed in 0.008 s
            06-19 15:16:05.649 [sg.node.BLOCK] Rendezvous[25539] at roku_analytics:/components/AnalyticsUtils.brs(221)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[25539] completed in 0.008 s
            Starting data processing
            06-19 16:48:10.772 [sg.node.BLOCK] Rendezvous[44468] at UriFetcher.dataProcessing.brs(109)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[44468] completed in 0.008 s
            06-19 16:48:10.752 [sg.node.BLOCK] Rendezvous[44467] at UriFetcher.dataProcessing.brs(83)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[44467] completed in 0.008 s
            06-19 16:48:10.792 [sg.node.BLOCK] Rendezvous[44469] at UriFetcher.dataProcessing.brs(83)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[44469] completed in 0.008 s
            Data processing completed
            07-04 19:02:30.079 [sg.node.BLOCK  ] Rendezvous[27] at NetworkService.addRequestToQueue(69)
            07-04 19:02:30.117 [sg.node.BLOCK  ] Rendezvous[28] at NetworkService.processRequestFromQueue(87)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[28] completed in 0.008 s
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[27] completed in 0.008 s
            07-04 19:02:30.121 [sg.node.BLOCK  ] Rendezvous[29] at NetworkService.processRequestFromQueue(104)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[29] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[30] at NetworkService.processRequestFromQueue(128)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[30] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[31] at NetworkService.processRequestFromQueue(129)
            06-19 21:13:28.414 [sg.node.UNBLOCK] Rendezvous[31] completed
            07-04 19:02:30.079 [sg.node.BLOCK  ] Rendezvous[27] at NetworkService2.addRequestToQueue(69)
            07-04 19:02:30.117 [sg.node.BLOCK  ] Rendezvous[28] at NetworkService2.processRequestFromQueue(87)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[28] completed in 0.008 s
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[27] completed in 0.008 s
            07-04 19:02:30.121 [sg.node.BLOCK  ] Rendezvous[29] at NetworkService2.processRequestFromQueue(104)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[29] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[30] at NetworkService2.processRequestFromQueue(128)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[30] completed in 0.008 s
            07-04 19:02:30.129 [sg.node.BLOCK  ] Rendezvous[31] at NetworkService2.processRequestFromQueue(129)
            06-19 21:13:28.414 [sg.node.UNBLOCK] Rendezvous[31] completed
            07-04 13:23:15.284 [sg.node.BLOCK] Rendezvous[31233] at pkg:/components/Tasks/TrackerTask/TrackerTask.xml(621)
            06-18 19:06:20.206 [sg.node.UNBLOCK] Rendezvous[31233] completed in 0.008 s
        `.replace(/ {4}/g, '');

        expectedHistory = {
            hitCount: 19,
            occurrences: {
                'pkg:/components/Modules/Analytics/Video/VideoTracking/Tasks/VHLVideoTrackingTask.brs': {
                    occurrences: {
                        126: {
                            clientLineNumber: 126,
                            clientPath: '/components/Modules/Analytics/Video/VideoTracking/Tasks/VHLVideoTrackingTask.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 1,
                    totalTime: 0.008,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'pkg:/components/Tasks/UriFetcher/UriFetcher.brs': {
                    occurrences: {
                        57: {
                            clientLineNumber: 57,
                            clientPath: '/components/Tasks/UriFetcher/UriFetcher.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        168: {
                            clientLineNumber: 168,
                            clientPath: '/components/Tasks/UriFetcher/UriFetcher.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 2,
                    totalTime: 0.016,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'roku_analytics:/components/AnalyticsUtils.brs': {
                    occurrences: {
                        221: {
                            clientLineNumber: 221,
                            clientPath: 'roku_analytics:/components/AnalyticsUtils.brs',
                            hitCount: 2,
                            totalTime: 0.016,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 2,
                    totalTime: 0.016,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'UriFetcher.dataProcessing.brs': {
                    occurrences: {
                        83: {
                            clientLineNumber: 83,
                            clientPath: 'UriFetcher.dataProcessing.brs',
                            hitCount: 2,
                            totalTime: 0.016,
                            type: 'lineInfo'
                        },
                        109: {
                            clientLineNumber: 109,
                            clientPath: 'UriFetcher.dataProcessing.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 3,
                    totalTime: 0.024,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                },
                'NetworkService.brs': {
                    occurrences: {
                        69: {
                            clientLineNumber: 69,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        87: {
                            clientLineNumber: 87,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        104: {
                            clientLineNumber: 104,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        128: {
                            clientLineNumber: 128,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        129: {
                            clientLineNumber: 129,
                            clientPath: 'NetworkService.brs',
                            hitCount: 1,
                            totalTime: 0,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 5,
                    totalTime: 0.032,
                    type: 'fileInfo',
                    zeroCostHitCount: 1
                },
                'NetworkService2.xml': {
                    occurrences: {
                        69: {
                            clientLineNumber: 69,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        87: {
                            clientLineNumber: 87,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        104: {
                            clientLineNumber: 104,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        128: {
                            clientLineNumber: 128,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        },
                        129: {
                            clientLineNumber: 129,
                            clientPath: 'NetworkService2.xml',
                            hitCount: 1,
                            totalTime: 0,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 5,
                    totalTime: 0.032,
                    type: 'fileInfo',
                    zeroCostHitCount: 1
                },
                'pkg:/components/Tasks/TrackerTask/TrackerTask.xml': {
                    occurrences: {
                        621: {
                            clientLineNumber: 621,
                            clientPath: '/components/Tasks/TrackerTask/TrackerTask.xml',
                            hitCount: 1,
                            totalTime: 0.008,
                            type: 'lineInfo'
                        }
                    },
                    hitCount: 1,
                    totalTime: 0.008,
                    type: 'fileInfo',
                    zeroCostHitCount: 0
                }
            },
            totalTime: 0.13600000000000007,
            type: 'historyInfo',
            zeroCostHitCount: 2
        };

    });

    afterEach(async () => {
        sinon.restore();
        rendezvousTrackerMock.restore();

        //prevent hitting the network during teardown
        rendezvousTracker.toggleEcpRendezvousTracking = () => Promise.resolve() as any;
        rendezvousTracker['runSGLogrendezvousCommand'] = () => Promise.resolve() as any;

        await rendezvousTracker?.destroy();
    });

    describe('isEcpRendezvousTrackingSupported ', () => {
        it('works', () => {
            rendezvousTracker['deviceInfo'].softwareVersion = '11.0.0';
            expect(rendezvousTracker.doesHostSupportEcpRendezvousTracking).to.be.false;

            rendezvousTracker['deviceInfo'].softwareVersion = '11.5.0';
            expect(rendezvousTracker.doesHostSupportEcpRendezvousTracking).to.be.true;

            rendezvousTracker['deviceInfo'].softwareVersion = '12.0.1';
            expect(rendezvousTracker.doesHostSupportEcpRendezvousTracking).to.be.true;
        });
    });

    describe('on', () => {
        it('supports unsubscribing', () => {
            const spy = sinon.spy();
            const disconnect = rendezvousTracker.on('rendezvous', spy);
            rendezvousTracker['emit']('rendezvous', {});
            rendezvousTracker['emit']('rendezvous', {});
            expect(spy.callCount).to.eql(2);
            disconnect();
            expect(spy.callCount).to.eql(2);
            //disconnect again to fix code coverage
            delete rendezvousTracker['emitter'];
            disconnect();
        });
    });

    describe('getIsTelnetRendezvousTrackingEnabled', () => {
        async function doTest(rawResponse: string, expectedValue: boolean) {
            const stub = sinon.stub(SceneGraphDebugCommandController.prototype, 'logrendezvous').returns(Promise.resolve({
                result: {
                    rawResponse: 'on\n'
                }
            } as any));
            expect(
                await rendezvousTracker.getIsTelnetRendezvousTrackingEnabled()
            ).to.be.true;
            stub.restore();
        }

        it('handles various responses', async () => {
            await doTest('on', true);
            await doTest('on\n', true);
            await doTest('on \n', true);
            await doTest('off', false);
            await doTest('off\n', false);
            await doTest('off \n', false);
        });

        it('does not crash on missing response', async () => {
            await doTest(undefined, true);
        });

        it('logs an error', async () => {
            const stub = sinon.stub(rendezvousTracker['logger'], 'warn');
            sinon.stub(
                SceneGraphDebugCommandController.prototype, 'logrendezvous'
            ).returns(
                Promise.reject(new Error('crash'))
            );
            await rendezvousTracker.getIsTelnetRendezvousTrackingEnabled();
            expect(stub.called).to.be.true;
        });
    });

    describe('startEcpPingTimer', () => {
        it('only sets the timer once', () => {
            rendezvousTracker.startEcpPingTimer();
            const ecpPingTimer = rendezvousTracker['ecpPingTimer'];
            rendezvousTracker.startEcpPingTimer();
            //the timer reference shouldn't have changed
            expect(ecpPingTimer).to.eql(rendezvousTracker['ecpPingTimer']);
            //stop the timer
            rendezvousTracker.stopEcpPingTimer();
            expect(rendezvousTracker['ecpPingTimer']).to.be.undefined;
            //stopping while stopped is a noop
            rendezvousTracker.stopEcpPingTimer();
        });
    });

    describe('pingEcpRendezvous ', () => {
        it('works', async () => {
            sinon.stub(rendezvousTracker, 'getEcpRendezvous').returns(Promise.resolve({ 'trackingEnabled': true, 'items': [{ 'id': '1403', 'startTime': '97771301', 'endTime': '97771319', 'lineNumber': '11', 'file': 'pkg:/components/Tasks/GetSubReddit.brs' }, { 'id': '1404', 'startTime': '97771322', 'endTime': '97771322', 'lineNumber': '15', 'file': 'pkg:/components/Tasks/GetSubReddit.brs' }] }));
            await rendezvousTracker.pingEcpRendezvous();
            expect(rendezvousTracker['rendezvousHistory']).to.eql({ 'hitCount': 2, 'occurrences': { 'pkg:/components/Tasks/GetSubReddit.brs': { 'occurrences': { '11': { 'clientLineNumber': 11, 'clientPath': '/components/Tasks/GetSubReddit.brs', 'hitCount': 1, 'totalTime': 0.018, 'type': 'lineInfo' }, '15': { 'clientLineNumber': 15, 'clientPath': '/components/Tasks/GetSubReddit.brs', 'hitCount': 1, 'totalTime': 0, 'type': 'lineInfo' } }, 'hitCount': 2, 'totalTime': 0.018, 'type': 'fileInfo', 'zeroCostHitCount': 1 } }, 'totalTime': 0.018, 'type': 'historyInfo', 'zeroCostHitCount': 1 });
        });
    });

    describe('activateEcpTracking', () => {
        beforeEach(() => {
            sinon.stub(rendezvousTracker, 'pingEcpRendezvous').returns(Promise.resolve());
            sinon.stub(rendezvousTracker, 'startEcpPingTimer').callsFake(() => { });
            sinon.stub(rendezvousTracker, 'toggleEcpRendezvousTracking').returns(Promise.resolve(true));
        });

        it('does not activate if telnet and ecp are both off', async () => {
            sinon.stub(rendezvousTracker as any, 'runSGLogrendezvousCommand').returns(Promise.resolve(''));
            sinon.stub(rendezvousTracker, 'getIsEcpRendezvousTrackingEnabled').returns(Promise.resolve(false));
            sinon.stub(rendezvousTracker, 'getIsTelnetRendezvousTrackingEnabled').returns(Promise.resolve(false));
            expect(
                await rendezvousTracker.activate()
            ).to.be.false;
        });

        it('activates if telnet is enabled but ecp is disabled', async () => {
            sinon.stub(rendezvousTracker as any, 'runSGLogrendezvousCommand').returns(Promise.resolve(''));
            sinon.stub(rendezvousTracker, 'getIsEcpRendezvousTrackingEnabled').returns(Promise.resolve(false));
            sinon.stub(rendezvousTracker, 'getIsTelnetRendezvousTrackingEnabled').returns(Promise.resolve(true));
            expect(
                await rendezvousTracker.activate()
            ).to.be.true;
        });

        it('activates if telnet is disabled but ecp is enabled', async () => {
            sinon.stub(rendezvousTracker as any, 'runSGLogrendezvousCommand').returns(Promise.resolve(''));
            sinon.stub(rendezvousTracker, 'getIsEcpRendezvousTrackingEnabled').returns(Promise.resolve(true));
            sinon.stub(rendezvousTracker, 'getIsTelnetRendezvousTrackingEnabled').returns(Promise.resolve(false));
            expect(
                await rendezvousTracker.activate()
            ).to.be.true;
        });
    });

    describe('processLog ', () => {
        it('filters out all rendezvous log lines', async () => {
            rendezvousTrackerMock.expects('emit').withArgs('rendezvous').once();
            rendezvousTracker['trackingSource'] = 'telnet';

            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(await rendezvousTracker.processLog(logString), expected);
            assert.deepEqual(rendezvousTracker.getRendezvousHistory, expectedHistory);
            rendezvousTrackerMock.verify();
        });

        it('does not filter out rendezvous log lines', async () => {
            rendezvousTrackerMock.expects('emit').withArgs('rendezvous').once();
            rendezvousTracker.setConsoleOutput('full');
            rendezvousTracker['trackingSource'] = 'telnet';

            assert.equal(await rendezvousTracker.processLog(logString), logString);
            assert.deepEqual(rendezvousTracker.getRendezvousHistory, expectedHistory);
            rendezvousTrackerMock.verify();
        });

        it('does not discard extra newlines', async () => {
            const text = `\n\r\nmessage\n\r\n\nmessage\n\r\n`;
            expect(
                await rendezvousTracker.processLog(text)
            ).to.eql(text);
        });

        it('does not crash for files not found by the source locator', async () => {
            //return undefined for all sources requested
            rendezvousTracker.registerSourceLocator(() => {
                return undefined;
            });
            expect(
                (await rendezvousTracker.processLog(`10-16 01:42:27.126 [sg.node.BLOCK] Rendezvous[2442] at roku_ads_lib:/libsource/Roku_Ads_SG_Wrappers.brs(1262)\r\n`
                )).trim()
            ).to.eql('');
            //the test passes if it doesn't explode on the file path
        });
    });

    describe('clearHistory', () => {
        it('to reset the history data', async () => {
            rendezvousTrackerMock.expects('emit').withArgs('rendezvous').twice();
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            rendezvousTracker['trackingSource'] = 'telnet';
            assert.equal(await rendezvousTracker.processLog(logString), expected);
            assert.deepEqual(rendezvousTracker.getRendezvousHistory, expectedHistory);

            rendezvousTracker.clearHistory();

            assert.deepEqual(rendezvousTracker.getRendezvousHistory, {
                hitCount: 0,
                occurrences: {},
                totalTime: 0.00,
                type: 'historyInfo',
                zeroCostHitCount: 0
            });
            rendezvousTrackerMock.verify();
        });
    });
});
