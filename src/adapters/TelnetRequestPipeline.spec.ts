import { TelnetCommand, TelnetRequestPipeline } from './TelnetRequestPipeline';
import { defer, util } from '../util';
import { expect } from 'chai';
import dedent = require('dedent');
import { logger } from '../logging';
import { clean } from '../testHelpers.spec';
import { Deferred } from 'brighterscript';
import { createSandbox } from 'sinon';
const sinon = createSandbox();

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
        on: function(eventName: string, listener: (data: Buffer) => void) {
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
        sinon.restore();
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

    afterEach(() => {
        sinon.restore();
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
        const deferred = defer();
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

    it('moves on to the next command if the current command failed', async () => {
        pipeline.isAtDebuggerPrompt = true;
        let command1: TelnetCommand;
        let command2: TelnetCommand;

        const executeStub = sinon.stub(TelnetCommand.prototype, 'execute').callsFake(function(this: TelnetCommand) {
            // resolve command2 immediately
            if (this === command2) {
                command2['deferred'].resolve('');
            }
        });

        void pipeline.executeCommand('test 1', { waitForPrompt: true });
        command1 = pipeline['activeCommand'];
        void pipeline.executeCommand('test 2', { waitForPrompt: true });
        command2 = pipeline['commands'][0];

        //stub the logger function so it throws an exception
        const loggerDebugStub = sinon.stub(command1.logger, 'debug').callsFake(() => {
            //only crash the first time
            if (loggerDebugStub.callCount === 1) {
                throw new Error('Crash!');
            }
        });

        //pass some bad data to the command, which causes it to throw an exception
        pipeline['handleData'](`bad data\n/${prompt}`);

        //make sure this test actually did what we thought...that the logger.debug() function was called and had a chance to throw
        expect(loggerDebugStub.called).to.be.true;
        //restore the logger function so the next command doesn't crash
        loggerDebugStub.restore();

        //command1 should be a rejected promise
        expect(command1['deferred'].isRejected).to.be.true;

        //wait for command2 to finish executing
        await command2.promise;
        expect(command2['deferred'].isResolved).to.be.true;

        //should have executed the second command after the first one failed
        expect(executeStub.callCount).to.equal(2);

    });

    describe('TelnetCommand', () => {
        it('serializes to just the important bits', () => {
            const command = new TelnetCommand('print m', true, logger, pipeline, 3);
            expect(
                JSON.parse(JSON.stringify(command))
            ).to.eql({
                id: 3,
                commandText: 'print m',
                waitForPrompt: true,
                isCompleted: false
            });
        });
    });
});
