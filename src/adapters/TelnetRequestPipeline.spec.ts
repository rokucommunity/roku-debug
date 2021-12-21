import { TelnetRequestPipeline } from './TelnetRequestPipeline';
import { util } from '../util';
import { expect } from 'chai';
import dedent = require('dedent');
import { logger } from '../logging';
import { clean } from '../testHelpers.spec';
import { Deferred } from 'brighterscript';

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
        logger.logLevel = 'off';
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
            await pipeline.executeCommand('doSomething', { waitForPrompt: true })
        ).to.eql(
            //we force debugger prompts onto their own line, so the leading space before prompt and the injected newline should be here too
            'some text \n'
        );
    });

    it('handles debugger prompt separate from data', async () => {
        handleData(prompt);
        socket.messageQueue.push([
            'some text',
            ' Brightscript Debugger>'
        ]);
        expect(
            await pipeline.executeCommand('doSomething', { waitForPrompt: true })
        ).to.eql(
            //we force debugger prompts onto their own line, so the leading space before prompt and the injected newline should be here too
            'some text \n'
        );
    });

    it('returns value when sending response', async () => {
        handleData(prompt);
        socket.messageQueue.push('response 1\nBrightscript Debugger>');
        expect(
            await pipeline.executeCommand('get response', { waitForPrompt: true })
        ).to.eql(
            'response 1\n'
        );
    });

    it('only returns the data from before the first debugger prompt', async () => {
        handleData(prompt);
        socket.messageQueue.push(
            'response 1\n' +
            'Brightscript Debugger>\n' +
            'response 2\n' +
            'Brightscript Debugger>'
        );

        //should get the first response, and the second should be discarded
        expect(dedent(
            await pipeline.executeCommand('get response', { waitForPrompt: true })
        )).to.eql(
            'response 1'
        );

        socket.messageQueue.push(
            'response 3\n' +
            'Brightscript Debugger>\n' +
            'response 4\n' +
            'Brightscript Debugger>\n'
        );

        //since "response 2 was discarded", we should be given "response 3"
        expect(
            await pipeline.executeCommand('get response', { waitForPrompt: true })
        ).to.eql(
            'response 3\n'
        );
    });

    it('handles preceeding log entries before a command', async () => {
        handleData(`log message 1\n${prompt}`);
        socket.messageQueue.push(`\nboolean\n${prompt}`);
        expect(
            await pipeline.executeCommand('print type(true)', { waitForPrompt: true })
        ).to.eql(
            '\nboolean\n'
        );

        //small timeout to let the remaining logging be emitted
        await util.sleep(10);

        expect(clean(consoleOutput)).to.eql(clean`
            log message 1
            ${prompt}print type(true)
            boolean
            ${prompt}
        `);
        expect(unhandledConsoleOutput).to.eql(clean`
            log message 1
            ${prompt}
        `);
    });

    it('emits unhandled output', async () => {
        handleData(`log message 1\n${prompt}`);
        socket.messageQueue.push(`\nboolean\n${prompt}`);
        expect(
            await pipeline.executeCommand('print type(true)', { waitForPrompt: true })
        ).to.eql(
            '\nboolean\n'
        );

        //small timeout to let the remaining logging be emitted
        await util.sleep(10);

        expect(clean(consoleOutput)).to.eql(clean`
            log message 1
            ${prompt}print type(true)
            boolean
            ${prompt}
        `);
        expect(unhandledConsoleOutput).to.eql(clean`
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
                await pipeline.executeCommand('commandDoesNotMatter', { waitForPrompt: true })
            ).to.equal(
                'vscode_key_start:message1:vscode_key_stop vscode_is_string:trueHello\r\n' +
                'vscode_key_start:message2:vscode_key_stop vscode_is_string:trueWorld\r\n\r\n'
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
                await pipeline.executeCommand('commandDoesNotMatter', { waitForPrompt: true })
            ).to.equal(
                'Invalid\r\n'
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
                await pipeline.executeCommand('commandDoesNotMatter', { waitForPrompt: true })
            ).to.equal(
                'roAssociativeArray\r\n\r\n'
            );
        });

        it('joins split log messages together', async () => {
            socket.messageQueue.push();
            const outputEvents = [] as string[];
            const deferred = new Deferred();
            //there should be 2 events
            pipeline.on('console-output', (data) => {
                outputEvents.push(data);
                if (outputEvents.length === 2) {
                    deferred.resolve();
                }
            });
            handleData('1');
            handleData('2\r\n');
            handleData('3');
            handleData('4\r\n');
            await deferred.promise;
            expect(outputEvents).to.eql([
                '12\r\n',
                '34\r\n'
            ]);
        });
    });

});
