import type { Socket } from 'net';
import * as EventEmitter from 'eventemitter3';
import { util } from '../util';

export class TelnetRequestPipeline {
    constructor(
        private client: Socket
    ) {
        this.connect();
    }

    private requests: RequestPipelineRequest[] = [];
    private isAtDebuggerPrompt = false;

    private get isProcessing() {
        return this.currentRequest !== undefined;
    }

    private get hasRequests() {
        return this.requests.length > 0;
    }

    private currentRequest: RequestPipelineRequest = undefined;

    private emitter = new EventEmitter();

    public on(eventName: 'console-output' | 'unhandled-console-output', handler: (data: string) => void);
    public on(eventName: string, handler: (data: string) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            this.emitter.removeListener(eventName, handler);
        };
    }

    private emit(eventName: 'console-output' | 'unhandled-console-output', data: string) {
        this.emitter.emit(eventName, data);
    }

    private connect() {
        let allResponseText = '';
        let lastPartialLine = '';

        this.client.addListener('data', (data) => {
            let responseText = data.toString();
            util.logDebugFenced('Raw telnet data', responseText);
            const cumulative = lastPartialLine + responseText;
            //ensure all debugger prompts appear completely on their own line
            responseText = util.ensureDebugPromptOnOwnLine(responseText);
            if (!cumulative.endsWith('\n') && !util.checkForDebuggerPrompt(cumulative)) {
                // buffer was split and was not the result of a prompt, save the partial line
                lastPartialLine += responseText;
                return;
            }

            if (lastPartialLine) {
                // there was leftover lines, join the partial lines back together
                responseText = lastPartialLine + responseText;
                lastPartialLine = '';
            }

            //forward all raw console output
            this.emit('console-output', responseText);
            allResponseText += responseText;

            let foundDebuggerPrompt = util.checkForDebuggerPrompt(allResponseText);

            //if we are not processing, immediately broadcast the latest data
            if (!this.isProcessing) {
                this.emit('unhandled-console-output', allResponseText);
                allResponseText = '';

                if (foundDebuggerPrompt) {
                    this.isAtDebuggerPrompt = true;
                    if (this.hasRequests) {
                        // There are requests waiting to be processed
                        this.process();
                    }
                }
            } else {
                //if responseText produced a prompt, return the responseText
                if (foundDebuggerPrompt) {
                    //resolve the command's promise (if it cares)
                    this.isAtDebuggerPrompt = true;
                    this.currentRequest.onComplete(allResponseText);
                    allResponseText = '';
                    this.currentRequest = undefined;
                    //try to run the next request
                    this.process();
                }
            }
        });
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
        util.logDebug(`Command ${commandId} execute ${JSON.stringify(command)} and ${waitForPrompt ? '' : ' don\'t'} wait for prompt): \n`, command, '\n');
        return new Promise<string>((resolve, reject) => {
            let executeCommand = () => {
                let commandText = `${command}\r\n`;
                if (!silent) {
                    this.emit('console-output', command);
                }
                this.client.write(commandText);
                if (waitForPrompt) {
                    // The act of executing this command means we are no longer at the debug prompt
                    this.isAtDebuggerPrompt = false;
                }
            };

            let request = {
                executeCommand: executeCommand,
                onComplete: (data: string) => {
                    util.logDebugFenced(`Command ${commandId} execute ${JSON.stringify(command)} result`, data);
                    resolve(data);
                },
                waitForPrompt: waitForPrompt
            };

            if (!waitForPrompt) {
                if (!this.isProcessing || forceExecute) {
                    //fire and forget the command
                    request.executeCommand();
                    //the command doesn't care about the output, resolve it immediately
                    request.onComplete(undefined);
                } else {
                    // Skip this request as the device is not ready to accept the command or it can not be run at any time
                }
            } else {
                this.requests.push(request);
                if (this.isAtDebuggerPrompt) {
                    //start processing since we are already at a debug prompt (safe to call multiple times)
                    this.process();
                } else {
                    // do not run the command until the device is at a debug prompt.
                    // this will be detected in the data listener in the connect function
                }
            }
        });
    }

    /**
     * Internal request processing function
     */
    private process() {
        if (this.isProcessing || !this.hasRequests) {
            return;
        }

        //get the oldest command
        let nextRequest = this.requests.shift();
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
