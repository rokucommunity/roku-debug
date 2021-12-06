import { TelnetRequestPipeline } from './TelnetRequestPipeline';
import { util } from '../util';
import { expect } from 'chai';
import dedent = require('dedent');

const prompt = 'Brightscript Debugger>';

describe('RequestPipeline', () => {

    function handleData(data: string) {
        pipeline['handleData'](data);
    }

    let pipeline: TelnetRequestPipeline;
    let consoleOutput = '';
    let unhandledConsoleOutput = '';
    let socket = {
        listeners: [],
        messageQueue: [] as Array<string | string[]>,
        addListener: function(eventName: string, listener: (data: Buffer) => void) {
            this.listeners.push(listener);
        },
        /**
         * custom function for tests used to emit data to listeners
         */
        emit: function(data: string) {
            const buffer = Buffer.from(data);
            for (const listener of this.listeners) {
                listener(buffer);
            }
        },
        write: async function(text: string) {
            //flush messages after getting data written
            for (let messages of this.messageQueue) {
                messages = typeof messages === 'string' ? [messages] : messages;
                for (const message of messages) {
                    await util.sleep(1);
                    this.emit(message);
                }
            }
            this.messageQueue = [];
        }
    };

    beforeEach(() => {
        consoleOutput = '';
        unhandledConsoleOutput = '';
        socket.listeners = [];
        socket.messageQueue = [];
        pipeline = new TelnetRequestPipeline(socket as any);
        pipeline.connect();
        pipeline.on('console-output', (data) => {
            consoleOutput += data;
        });
        pipeline.on('unhandled-console-output', (data) => {
            unhandledConsoleOutput += data;
        });
    });

    it('handles split debugger prompt messages', async () => {
        handleData(prompt);
        socket.messageQueue.push([
            'some text Brightsc',
            'ript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', true)
        ).to.eql(
            'some text'
        );
    });

    it('handles debugger prompt separate from data', async () => {
        handleData(prompt);
        socket.messageQueue.push([
            'some text',
            ' Brightscript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', true)
        ).to.eql(
            'some text'
        );
    });

    it('returns value when sending response', async () => {
        handleData(prompt);
        socket.messageQueue.push('response 1\nBrightscript Debugger>');
        expect(
            await pipeline.executeCommand('get response', true)
        ).to.eql(
            'response 1'
        );
    });

    it('only returns the data from before the first debugger prompt', async () => {
        handleData(prompt);
        socket.messageQueue.push(`
            response 1
            Brightscript Debugger>
            response 2
            Brightscript Debugger>
        `);

        //should get the first response, and the second should be discarded
        expect(
            await pipeline.executeCommand('get response', true)
        ).to.eql(
            'response 1'
        );

        socket.messageQueue.push(`
            response 3
            Brightscript Debugger>
            response 4
            Brightscript Debugger>
        `);

        //since "response 2 was discarded", we should be given "response 3"
        expect(
            await pipeline.executeCommand('get response', true)
        ).to.eql(
            'response 3'
        );
    });

    it('handles preceeding log entries before a command', async () => {
        handleData(`log message 1\n${prompt}`);
        socket.messageQueue.push(`\nboolean\n${prompt}`);
        expect(
            await pipeline.executeCommand('print type(true)', true)
        ).to.eql(
            'boolean'
        );

        //small timeout to let the remaining logging be emitted
        await util.sleep(10);

        expect(consoleOutput).to.eql(dedent`
            log message 1
            ${prompt}print type(true)
            boolean
            ${prompt}
        `);
        expect(unhandledConsoleOutput).to.eql(dedent`
            log message 1
            ${prompt}
        `);
    });

    it('emits unhandled output', async () => {
        handleData(`log message 1\n${prompt}`);
        socket.messageQueue.push(`\nboolean\n${prompt}`);
        expect(
            await pipeline.executeCommand('print type(true)', true)
        ).to.eql(
            'boolean'
        );

        //small timeout to let the remaining logging be emitted
        await util.sleep(10);

        expect(consoleOutput).to.eql(dedent`
            log message 1
            ${prompt}print type(true)
            boolean
            ${prompt}
        `);
        expect(unhandledConsoleOutput).to.eql(dedent`
            log message 1
            ${prompt}
        `);
    });

    describe('', () => {
        it('correctly handles both types of line endings', async () => {
            //send prompt so pipeline will execute commands
            handleData(prompt);
            socket.messageQueue.push([
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n' +
                '\r\n' +
                'Brightscript Debugger>'
            ]);
            expect(
                await pipeline.executeCommand('commandDoesNotMatter', true)
            ).to.equal(
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld'
            );
        });

        it('removes warning statements introduced in 10.5', async () => {
            //send prompt so pipeline will execute commands
            handleData(prompt);
            socket.messageQueue.push([
                'Warning: operation may not be interruptible.\r\n' +
                'Invalid' +
                '\r\n' +
                'Brightscript Debugger>'
            ]);
            expect(
                await pipeline.executeCommand('commandDoesNotMatter', true)
            ).to.equal(
                'Invalid'
            );
        });

        it('Removes "thread attached" messages', async () => {
            //send prompt so pipeline will execute commands
            handleData(prompt);
            socket.messageQueue.push([
                'Warning: operation may not be interruptible.',
                'roAssociativeArray',
                '',
                'Brightscript Debugger> ',
                '',
                'Thread attached: pkg:/source/main.brs(6)                 screen.show()',
                '',
                '',
                ''
            ].join('\r\n'));
            expect(
                await pipeline.executeCommand('commandDoesNotMatter', true)
            ).to.equal(
                'roAssociativeArray'
            );
        });
    });

});
