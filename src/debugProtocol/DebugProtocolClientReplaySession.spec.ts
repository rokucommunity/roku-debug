import { expect } from 'chai';
import { DebugProtocolClientReplaySession } from './DebugProtocolClientReplaySession';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from './events/ProtocolEvent';
import * as fsExtra from 'fs-extra';

describe(DebugProtocolClientReplaySession.name, () => {
    let session: DebugProtocolClientReplaySession;

    afterEach(async () => {
        await session.destroy();
    });

    it.skip('debug this debugger.log file', async function test() {
        this.timeout(10000000000);
        const logPath = 'C:/users/bronley/downloads/2023-06-01T12∶21∶04-debugger.log';
        session = new DebugProtocolClientReplaySession({
            bufferLog: fsExtra.readFileSync(logPath).toString()
        });

        await session.run();
        expectClientReplayResult([], session.result);
        console.log(session);
    });
});

// eslint-disable-next-line @typescript-eslint/ban-types
function expectClientReplayResult(expected: Array<string | Function | ProtocolRequest | ProtocolResponse | ProtocolUpdate>, result: DebugProtocolClientReplaySession['result']) {
    expected = expected.map(x => {
        if (typeof x === 'function') {
            return x?.name;
        }
        return x;
    });
    let sanitizedResult = result.map((x, i) => {
        //if there is no expected object for this entry, or it's a constructor, then we will compare the constructor name
        if (expected[i] === undefined || typeof expected[i] === 'string') {
            return x?.constructor?.name;
            //deep compare the actual object
        } else {
            return x;
        }
    });
    expect(sanitizedResult).to.eql(expected);
}
