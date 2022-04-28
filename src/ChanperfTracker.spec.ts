import * as sinon from 'sinon';
import { assert, expect } from 'chai';
import type { ChanperfData } from './ChanperfTracker';
import { ChanperfTracker } from './ChanperfTracker';

describe('ChanperfTracker ', () => {
    let chanperfTracker: ChanperfTracker;
    let logString: string;
    let expectedHistory: Array<ChanperfData>;
    let expectedNoDataHistory: Array<ChanperfData>;
    let emitStub: sinon.SinonStub;

    beforeEach(() => {
        chanperfTracker = new ChanperfTracker();
        emitStub = sinon.stub(chanperfTracker as any, 'emit');

        // regex and examples also available at: https://regex101.com/r/AuQOxY/1
        logString = `channel: Start
            channel: mem=61560KiB{anon=36428,file=24884,shared=248},%cpu=13{user=10,sys=3}
            channel: mem=65992KiB{anon=40852,file=24892,shared=248},%cpu=21{user=19,sys=2}
            channel: mem=71836KiB{anon=46696,file=24892,shared=248},%cpu=30{user=25,sys=4}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=2{user=2,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248,swap=0},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71056KiB{anon=45916,file=24892,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71060KiB{anon=45916,file=24896,shared=248},%cpu=10{user=8,sys=2}
            channel: mem=71056KiB{anon=45916,file=24896,shared=244},%cpu=4{user=2,sys=2}
            channel: mem=71064KiB{anon=45920,file=24896,shared=244,swap=4},%cpu=12{user=11,sys=1}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=20{user=17,sys=3}
            Starting data processing
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71220KiB{anon=46068,file=24904,shared=248},%cpu=0{user=0,sys=0}
            channel: mem=71749KiB{anon=46068,file=24904,shared=248,swap=529},%cpu=0{user=0,sys=0}
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


        expectedHistory = [
            { error: null, memory: { total: 61560, anonymous: 36428, file: 24884, shared: 248, swap: 0 }, cpu: { total: 13, user: 10, system: 3 } },
            { error: null, memory: { total: 65992, anonymous: 40852, file: 24892, shared: 248, swap: 0 }, cpu: { total: 21, user: 19, system: 2 } },
            { error: null, memory: { total: 71836, anonymous: 46696, file: 24892, shared: 248, swap: 0 }, cpu: { total: 30, user: 25, system: 4 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 2, user: 2, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24892, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71060, anonymous: 45916, file: 24896, shared: 248, swap: 0 }, cpu: { total: 10, user: 8, system: 2 } },
            { error: null, memory: { total: 71056, anonymous: 45916, file: 24896, shared: 244, swap: 0 }, cpu: { total: 4, user: 2, system: 2 } },
            { error: null, memory: { total: 71064, anonymous: 45920, file: 24896, shared: 244, swap: 4 }, cpu: { total: 12, user: 11, system: 1 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 20, user: 17, system: 3 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71749, anonymous: 46068, file: 24904, shared: 248, swap: 529 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71232, anonymous: 46068, file: 24916, shared: 248, swap: 0 }, cpu: { total: 1, user: 1, system: 0 } },
            { error: null, memory: { total: 71228, anonymous: 46068, file: 24916, shared: 244, swap: 0 }, cpu: { total: 3, user: 3, system: 0 } },
            { error: null, memory: { total: 71676, anonymous: 46324, file: 25104, shared: 248, swap: 0 }, cpu: { total: 3, user: 2, system: 1 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71220, anonymous: 46068, file: 24904, shared: 248, swap: 0 }, cpu: { total: 0, user: 0, system: 0 } },
            { error: null, memory: { total: 71232, anonymous: 46068, file: 24916, shared: 248, swap: 0 }, cpu: { total: 1, user: 1, system: 0 } },
            { error: null, memory: { total: 71228, anonymous: 46068, file: 24916, shared: 244, swap: 0 }, cpu: { total: 3, user: 3, system: 0 } },
            { error: null, memory: { total: 71676, anonymous: 46324, file: 25104, shared: 248, swap: 0 }, cpu: { total: 3, user: 2, system: 1 } }
        ];

        // Convert everything to bytes
        for (let chanperfEvent of expectedHistory) {
            chanperfEvent.memory.total *= 1024;
            chanperfEvent.memory.anonymous *= 1024;
            chanperfEvent.memory.file *= 1024;
            chanperfEvent.memory.shared *= 1024;
            chanperfEvent.memory.swap *= 1024;
        }

        expectedNoDataHistory = [{
            error: { message: 'mem and cpu data not available' },
            memory: {
                total: 0,
                anonymous: 0,
                file: 0,
                shared: 0,
                swap: 0
            },
            cpu: {
                total: 0,
                user: 0,
                system: 0
            }
        }];
    });

    afterEach(() => {
        emitStub.restore();
    });

    describe('processLog ', () => {
        it('filters out all chanperf log lines', () => {
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(chanperfTracker.processLog(logString), expected);
            const history = emitStub.withArgs('chanperf').getCalls().map(x => x.args[1]);
            expect(history).to.eql(expectedHistory);
            expect(chanperfTracker.getHistory).to.eql(expectedHistory);
        });

        it('filters out all not available chanperf log lines', () => {
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(chanperfTracker.processLog(`channel: Start\nStarting data processing\nchannel: mem and cpu data not available\nData processing completed\n`), expected);
            const history = emitStub.withArgs('chanperf').getCalls().map(x => x.args[1]);
            expect(history).to.eql(expectedNoDataHistory);
            expect(chanperfTracker.getHistory).to.eql(expectedNoDataHistory);
        });

        it('does not filter out chanperf log lines', () => {
            chanperfTracker.setConsoleOutput('full');
            assert.equal(chanperfTracker.processLog(logString), logString);
            const history = emitStub.withArgs('chanperf').getCalls().map(x => {
                return x.args[1];
            });
            expect(history).to.eql(expectedHistory);
            expect(chanperfTracker.getHistory).to.eql(expectedHistory);
        });

        it('does not filter out the not available chanperf log lines', () => {
            let expected = `channel: Start\nStarting data processing\nchannel: mem and cpu data not available\nData processing completed\n`;
            chanperfTracker.setConsoleOutput('full');
            assert.equal(chanperfTracker.processLog(expected), expected);
            const history = emitStub.withArgs('chanperf').getCalls().map(x => x.args[1]);
            expect(history).to.eql(expectedNoDataHistory);
            expect(chanperfTracker.getHistory).to.eql(expectedNoDataHistory);
        });

        it('does not discard extra newlines', () => {
            const text = `\n\r\nmessage\n\r\n\nmessage\n\r\n`;
            expect(
                chanperfTracker.processLog(text)
            ).to.eql(text);
        });
    });

    describe('clearHistory', () => {
        it('to reset the history data', () => {
            let expected = `channel: Start\nStarting data processing\nData processing completed\n`;
            assert.equal(chanperfTracker.processLog(logString), expected);
            const history = emitStub.withArgs('chanperf').getCalls().map(x => x.args[1]);
            expect(history).to.eql(expectedHistory);
            expect(chanperfTracker.getHistory).to.eql(expectedHistory);

            // Reset the old history
            chanperfTracker.clearHistory();
            assert.deepEqual(chanperfTracker.getHistory, []);
        });
    });
});
