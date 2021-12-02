import { TelnetRequestPipeline } from './TelnetRequestPipeline';
import { util } from '../util';
import { expect } from 'chai';

describe('RequestPipeline', () => {
    let pipeline: TelnetRequestPipeline;
    let socket = {
        listeners: [],
        messageQueue: [] as Array<string[]>,
        addListener: function(eventName: string, listener: (data: Buffer) => void) {
            this.listeners.push(listener);
        },
        //custom function for tests used to emit data to listeners
        emit: function(data: string) {
            const buffer = Buffer.from(data);
            for (const listener of this.listeners) {
                listener(buffer);
            }
        },
        write: async function(text: string) {
            //flush messages after getting data written
            for (const messages of this.messageQueue) {
                for (const message of messages) {
                    await util.sleep(1);
                    this.emit(message);
                }
            }
        }
    };

    beforeEach(() => {
        socket.listeners = [];
        pipeline = new TelnetRequestPipeline(socket as any);
        pipeline['isAtDebuggerPrompt'] = true;
    });

    it('handles split debugger prompt messages', async () => {
        socket.messageQueue.push([
            'some text Brightsc',
            'ript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', true)
        ).to.eql(
            'some text Brightscript Debugger>'
        );
    });

    it('handles debugger prompt separate from data', async () => {
        socket.messageQueue.push([
            'some text',
            ' Brightscript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', true)
        ).to.eql(
            'some text Brightscript Debugger>'
        );
    });
});
