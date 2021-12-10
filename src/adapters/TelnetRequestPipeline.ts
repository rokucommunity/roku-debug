import type { Socket } from 'net';
import * as EventEmitter from 'eventemitter3';
import { util } from '../util';
import { logger } from '../logging';
import { Deferred } from 'brighterscript';

export class TelnetRequestPipeline {
    public constructor(
        public client: Socket
    ) {

    }

    private logger = logger.createLogger(`[${TelnetRequestPipeline.name}]`);

    private requests: RequestPipelineRequest[] = [];

    private isAtDebuggerPrompt = false;

    public get isProcessing() {
        return this.currentRequest !== undefined;
    }

    private get hasRequests() {
        return this.requests.length > 0;
    }

    private currentRequest: RequestPipelineRequest = undefined;

    private emitter = new EventEmitter();

    public on(eventName: 'console-output', handler: (data: string) => void);
    public on(eventName: 'unhandled-console-output', handler: (data: string) => void);
    public on(eventName: string, handler: (data: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.removeListener(eventName, handler);
        };
    }

    private emit(eventName: 'console-output', data: string);
    private emit(eventName: 'unhandled-console-output', data: string);
    private emit(eventName: string, data: any) {
        //run the event on next tick to avoid timing issues
        process.nextTick(() => {
            this.emitter.emit(eventName, data);
        });
    }

    /**
     * Start listening for future incoming data from the client
     */
    public connect() {
        this.client.addListener('data', (data) => {
            this.handleData(data.toString());
        });
    }

    /**
     * Any data that has not yet been fully processed. This could be a partial response
     * during a command execute, or a message split across multiple telnet terminals
     */
    private unhandledText = '';

    private handleData(data: string) {
        const logger = this.logger.createLogger(`[${TelnetRequestPipeline.prototype.handleData.name}]`);
        logger.debug('Raw telnet data', { data }, util.fence(data));

        //forward all raw console output to listeners
        this.emit('console-output', data);

        this.unhandledText += data;

        //ensure all debugger prompts appear completely on their own line
        this.unhandledText = util.ensureDebugPromptOnOwnLine(this.unhandledText);

        //discard all the "thread attached" messages as we find
        this.unhandledText = util.removeThreadAttachedText(this.unhandledText);

        //we are at a debugger prompt if the last text we received was "Brightscript Debugger>"
        this.isAtDebuggerPrompt = util.endsWithDebuggerPrompt(this.unhandledText);

        if (!this.isAtDebuggerPrompt && util.endsWithThreadAttachedText(this.unhandledText)) {
            //GIANT HACK!
            this.logger.log('Thread attached was possibly missing trailing debug prompt. Print an empty string which forces another debugger prompt.');
            this.client.write('print ""\r\n');
            //nothing more to do, let next call handle it.
            return;
        }

        if (this.isProcessing) {
            this.handleDataForIsProcessing();
        } else {
            this.handleDataForNotIsProcessing();
        }
    }

    private handleDataForNotIsProcessing() {
        if (
            //ends with newline
            /\n\s*/.exec(this.unhandledText) ||
            //we're at a debugger prompt
            this.isAtDebuggerPrompt
        ) {
            this.emit('unhandled-console-output', this.unhandledText);
            this.unhandledText = '';
        } else {
            // buffer was split and was not the result of a prompt, save the partial line and wait for more output
        }
    }

    private handleDataForIsProcessing() {
        //get the first response
        const match = /Brightscript Debugger>\s*/is.exec(this.unhandledText);
        if (match) {
            const response = this.cleanResponse(
                this.unhandledText.substring(0, match.index)
            );

            logger.debug('Found response before the first "Brightscript Debugger>" prompt', { response, allText: this.unhandledText });
            //remove the response from the unhandled text
            this.unhandledText = this.unhandledText.substring(match.index + match[0].length);

            //emit the remaining unhandled text
            if (this.unhandledText?.length > 0) {
                this.emit('unhandled-console-output', this.unhandledText);
            }
            //clear the unhandled text
            this.unhandledText = '';

            //return the response to the current request
            this.currentRequest.onComplete(response);
            //run a new request (if there are any)

            this.currentRequest = undefined;
            this.process();
        } else {
            // no prompt found, wait for more data from the device
        }
    }

    /**
     * Remove garbage from the response
     */
    private cleanResponse(text: string) {
        text = text
            //remove that pesky "may not be interruptible" warning
            .replace(/[ \t]*warning:\s*operation\s+may\s+not\s+be\s+interruptible.[ \t]*\r?\n?/i, '');
        return text;
    }

    /**
     * Used to help with logging
     */
    private commandIdSequence = 0;

    /**
     * Schedule a command to be run. Resolves with the result once the command finishes
     * @param commandFunction
     * @param waitForPrompt - if true, the promise will wait until we find a prompt, and return all output in between. If false, the promise will immediately resolve
     * @param forceExecute - if true, it is assumed the command can be run at any time and will be executed immediately
     * @param silent - if true, the command will be hidden from the output
     */
    public executeCommand(command: string, waitForPrompt: boolean, forceExecute = false, silent = false) {
        const commandId = this.commandIdSequence++;
        const logger = this.logger.createLogger(`[Command ${commandId}]`);
        logger.debug(`execute`, { command: command, waitForPrompt });
        let request = {
            deferred: new Deferred<string>(),
            id: commandId,
            waitForPrompt,
            forceExecute,
            silent,
            commandText: command,
            executeCommand: () => {
                try {
                    let commandText = `${command}\r\n`;
                    if (!silent) {
                        this.emit('console-output', command);
                    }

                    if (commandText.startsWith('for each vscodeLoopKey in request[\"context\"].keys()')) {
                        console.log('aaa');
                    } else {
                        this.client.write(commandText);
                    }

                    if (waitForPrompt) {
                        // The act of executing this command means we are no longer at the debug prompt
                        this.isAtDebuggerPrompt = false;
                    }
                } catch (e) {
                    logger.error('Error executing command', e);
                    request.deferred.reject('Error executing command');
                }
            },
            onComplete: (data: string) => {
                logger.debug(`execute result`, { ...request, data }, data ? util.fence(data) : '');
                request.deferred.resolve(data);
            }
        };

        if (!waitForPrompt) {
            if (!this.isProcessing || forceExecute) {
                logger.debug('fire and forget the command');
                request.executeCommand();
                //the command doesn't care about the output, resolve it immediately
                request.onComplete(undefined);
            } else {
                logger.debug('Skip this request as the device is not ready to accept the command or it can not be run at any time', { command: command });
            }
        } else {
            this.requests.push(request);
            if (this.isAtDebuggerPrompt) {
                logger.debug('start processing since we are already at a debug prompt (safe to call multiple times)');
                this.process();
            } else {
                logger.debug('Do not run the command until the device is at a debug prompt.');
            }
        }
        return request.deferred.promise;
    }

    /**
     * Internal request processing function
     */
    private process() {
        //return if we're already processing or if we have no requests
        if (this.isProcessing || !this.hasRequests) {
            this.logger.log('do not process, because', { isProcessing: this.isProcessing, hasRequests: this.hasRequests });
            return;
        }

        //get the oldest command
        let nextRequest = this.requests.shift();
        this.logger.log('Process the next request', { remainingRequests: this.requests.length, nextRequest });
        this.currentRequest = nextRequest;

        //run the request. the data listener will handle launching the next request once this one has finished processing
        nextRequest.executeCommand();
    }

    public destroy() {
        this.client.removeAllListeners();
        this.client.destroy();
        this.client = undefined;
    }
}

interface RequestPipelineRequest {
    executeCommand: () => void;
    onComplete: (data: string) => void;
    waitForPrompt: boolean;
}
