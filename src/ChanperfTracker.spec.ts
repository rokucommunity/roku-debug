import * as sinon from 'sinon';
import { assert, expect } from 'chai';
import type { ChanperfHistory } from './ChanperfTracker';
import { ChanperfTracker } from './ChanperfTracker';

describe('BrightScriptFileUtils ', () => {
    let chanperfTracker: ChanperfTracker;
    let chanperfTrackerMock;
    let logString: string;
    let expectedHistory: ChanperfHistory;

    beforeEach(() => {
        chanperfTracker = new ChanperfTracker();
        chanperfTrackerMock = sinon.mock(chanperfTracker);

        // regex and examples also available at: https://regex101.com/r/AuQOxY/1
        logString = `channel: Start
            channel: mem=61560KiB{anon=36428,file=24884,shared=248},%cpu=13{user=10,sys=3}
            channel: mem=65992KiB{anon=40852,file=24892,shared=248},%cpu=21{user=19,sys=2}
            channel: mem=71836KiB{anon=46696,file=24892,shared=248},%cpu=30{user=25,sys=4}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=2{user=2,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71060KiB{anon=45916,file=24896,shared=248},%cpu=10{user=8,sys=2}
            channel: mem=71056KiB{anon=45916,file=24896,shared=244},%cpu=4{user=2,sys=2}
            channel: mem=71060KiB{anon=45920,file=24896,shared=244},%cpu=12{user=11,sys=1}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=20{user=17,sys=3}
            Starting data processing
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71232KiB{anon=46068,file=24916,shared=248},%cpu=1{user=1,sys=0}
            channel: mem=71228KiB{anon=46068,file=24916,shared=244},%cpu=3{user=3,sys=0}
            channel: mem=71676KiB{anon=46324,file=25104,shared=248},%cpu=3{user=2,sys=1}
            Data processing completed
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71232KiB{anon=46068,file=24916,shared=248},%cpu=1{user=1,sys=0}
            channel: mem=71228KiB{anon=46068,file=24916,shared=244},%cpu=3{user=3,sys=0}
            channel: mem=71676KiB{anon=46324,file=25104,shared=248},%cpu=3{user=2,sys=1}
        `.replace(/ {4}/g, '');

        expectedHistory = {
            missingInfoMessage: null,
            memory: {
                total: 71676,
                anonymous: 46324,
                file: 25104,
                shared: 248
            },
            memoryEvents: {
                total: [
                    61560,
                    65992,
                    71836,
                    71056,
                    71056,
                    71056,
                    71056,
                    71056,
                    71056,
                    71056,
                    71056,
                    71060,
                    71056,
                    71060,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71232,
                    71228,
                    71676,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71220,
                    71232,
                    71228,
                    71676
                ],
                anonymous: [
                    36428,
                    40852,
                    46696,
                    45916,
                    45916,
                    45916,
                    45916,
                    45916,
                    45916,
                    45916,
                    45916,
                    45916,
                    45916,
                    45920,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46324,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46068,
                    46324
                ],
                file: [
                    24884,
                    24892,
                    24892,
                    24892,
                    24892,
                    24892,
                    24892,
                    24892,
                    24892,
                    24892,
                    24892,
                    24896,
                    24896,
                    24896,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24916,
                    24916,
                    25104,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24904,
                    24916,
                    24916,
                    25104
                ],
                shared: [
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    244,
                    244,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    244,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    248,
                    244,
                    248
                ]
            },
            cpu: {
                total: 3,
                user: 2,
                system: 1
            },
            cpuEvents: {
                total: [
                    13,
                    21,
                    30,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    10,
                    4,
                    12,
                    20,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    3,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    3,
                    3
                ],
                user: [
                    10,
                    19,
                    25,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    8,
                    2,
                    11,
                    17,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    3,
                    2,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    3,
                    2
                ],
                system: [
                    3,
                    2,
                    4,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    2,
                    2,
                    1,
                    3,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    0,
                    1
                ]
            }
        };

    });

    afterEach(() => {
        chanperfTrackerMock.restore();
    });

    describe('processLogLine ', () => {
        it('filters out all chanperf log lines', () => {
            chanperfTrackerMock.expects('emit').withArgs('chanperf-event').once();
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(chanperfTracker.processLogLine(logString), expected);
            assert.deepEqual(chanperfTracker.getChanperfHistory, expectedHistory);
            chanperfTrackerMock.verify();
        });

        it('filters out all not available chanperf log lines', () => {
            chanperfTrackerMock.expects('emit').withArgs('chanperf-event').once();
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(chanperfTracker.processLogLine(`channel: Start\nStarting data processing\nchannel: mem and cpu data not available\nData processing completed\n`), expected);
            assert.deepEqual(chanperfTracker.getChanperfHistory, {
                missingInfoMessage: 'mem and cpu data not available',
                memory: {
                    total: 0,
                    anonymous: 0,
                    file: 0,
                    shared: 0
                },
                memoryEvents: {
                    total: [],
                    anonymous: [],
                    file: [],
                    shared: []
                },
                cpu: {
                    total: 0,
                    user: 0,
                    system: 0
                },
                cpuEvents: {
                    total: [],
                    user: [],
                    system: []
                }
            });
            chanperfTrackerMock.verify();
        });

        it('does not filter out chanperf log lines', () => {
            chanperfTrackerMock.expects('emit').withArgs('chanperf-event').once();
            chanperfTracker.setConsoleOutput('full');
            assert.equal(chanperfTracker.processLogLine(logString), logString);
            assert.deepEqual(chanperfTracker.getChanperfHistory, expectedHistory);
            chanperfTrackerMock.verify();
        });

        it('does not filter out the not available chanperf log lines', () => {
            chanperfTrackerMock.expects('emit').withArgs('chanperf-event').once();
            let expected = `channel: Start\nStarting data processing\nchannel: mem and cpu data not available\nData processing completed\n`;
            chanperfTracker.setConsoleOutput('full');
            assert.equal(chanperfTracker.processLogLine(expected), expected);
            assert.deepEqual(chanperfTracker.getChanperfHistory, {
                missingInfoMessage: 'mem and cpu data not available',
                memory: {
                    total: 0,
                    anonymous: 0,
                    file: 0,
                    shared: 0
                },
                memoryEvents: {
                    total: [],
                    anonymous: [],
                    file: [],
                    shared: []
                },
                cpu: {
                    total: 0,
                    user: 0,
                    system: 0
                },
                cpuEvents: {
                    total: [],
                    user: [],
                    system: []
                }
            });
            chanperfTrackerMock.verify();
        });
    });

    describe('clearChanperfHistory', () => {
        it('to reset the history data', () => {
            chanperfTrackerMock.expects('emit').withArgs('chanperf-event').twice();
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(chanperfTracker.processLogLine(logString), expected);
            assert.deepEqual(chanperfTracker.getChanperfHistory, expectedHistory);

            chanperfTracker.clearChanperfHistory();

            assert.deepEqual(chanperfTracker.getChanperfHistory, {
                memory: {
                    total: 0,
                    anonymous: 0,
                    file: 0,
                    shared: 0
                },
                memoryEvents: {
                    total: [],
                    anonymous: [],
                    file: [],
                    shared: []
                },
                cpu: {
                    total: 0,
                    user: 0,
                    system: 0
                },
                cpuEvents: {
                    total: [],
                    user: [],
                    system: []
                }
            });
            chanperfTrackerMock.verify();
        });
    });
});
