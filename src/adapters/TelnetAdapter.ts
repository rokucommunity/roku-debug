import { orderBy } from 'natural-orderby';
import * as EventEmitter from 'eventemitter3';
import { Socket } from 'net';
import { rokuDeploy } from 'roku-deploy';
import { PrintedObjectParser } from '../PrintedObjectParser';
import type { BSDebugDiagnostic } from '../CompileErrorProcessor';
import { CompileErrorProcessor } from '../CompileErrorProcessor';
import type { RendezvousTracker } from '../RendezvousTracker';
import type { ChanperfData } from '../ChanperfTracker';
import { ChanperfTracker } from '../ChanperfTracker';
import { defer, util } from '../util';
import { logger } from '../logging';
import type { AdapterOptions, RokuAdapterEvaluateResponse } from '../interfaces';
import { HighLevelType } from '../interfaces';
import { TelnetRequestPipeline } from './TelnetRequestPipeline';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';
import type { ExceptionBreakpoint } from '../debugProtocol/events/requests/SetExceptionBreakpointsRequest';
import { SocketConnectionInUseError } from '../Exceptions';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class TelnetAdapter {
    constructor(
        private options: AdapterOptions & {
            enableDebuggerAutoRecovery?: boolean;
        },
        private rendezvousTracker: RendezvousTracker
    ) {
        util.normalizeAdapterOptions(this.options);
        this.options.enableDebuggerAutoRecovery ??= false;

        this.connected = false;
        this.emitter = new EventEmitter();
        this.debugStartRegex = /BrightScript Micro Debugger\./ig;
        this.debugEndRegex = /Brightscript Debugger>/ig;
        this.chanperfTracker = new ChanperfTracker();
        this.compileErrorProcessor = new CompileErrorProcessor();

        // watch for chanperf events
        this.chanperfTracker.on('chanperf', (output) => {
            this.emit('chanperf', output);
        });
    }

    private connectionDeferred = defer<void>();

    public isConnected(): Promise<void> {
        return this.connectionDeferred.promise;
    }

    public logger = logger.createLogger(`[tadapter]`);
    /**
     * Indicates whether the adapter has successfully established a connection with the device
     */
    public connected: boolean;

    private compileErrorProcessor: CompileErrorProcessor;
    public requestPipeline: TelnetRequestPipeline;
    private emitter: EventEmitter;
    private isNextBreakpointSkipped = false;
    private isInMicroDebugger: boolean;
    private debugStartRegex: RegExp;
    private debugEndRegex: RegExp;
    private chanperfTracker: ChanperfTracker;
    private stackFramesCache: Record<number, StackFrame> = {};

    private cache = {};

    /**
     * Does this adapter support the `execute` command (known as `eval` in telnet)
     */
    public supportsExecute = true;

    public supportsExceptionBreakpoints = false;

    public once(eventName: 'app-ready'): Promise<void>;
    public once(eventName: 'connected'): Promise<boolean>;
    public once(eventName: string) {
        return new Promise((resolve) => {
            const disconnect = this.on(eventName as Parameters<DebugProtocolAdapter['on']>[0], (...args) => {
                disconnect();
                resolve(...args);
            });
        });
    }

    /**
     * Subscribe to various events
     * @param eventName
     * @param handler
     */
    public on(eventName: 'cannot-continue', handler: () => any);
    public on(eventname: 'chanperf', handler: (output: ChanperfData) => any);
    public on(eventName: 'close', handler: () => any);
    public on(eventName: 'app-exit', handler: () => any);
    public on(eventName: 'diagnostics', handler: (params: BSDebugDiagnostic[]) => any);
    public on(eventName: 'connected', handler: (params: boolean) => any);
    public on(eventname: 'console-output', handler: (output: string) => any);
    public on(eventName: 'runtime-error', handler: (error: BrightScriptRuntimeError) => any);
    public on(eventName: 'suspend', handler: () => any);
    public on(eventName: 'start', handler: () => any);
    public on(eventname: 'device-unresponsive', handler: (data: { lastCommand: string }) => any);
    public on(eventname: 'unhandled-console-output', handler: (output: string) => any);
    public on(eventName: string, handler: (payload: any) => any) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'diagnostics', data: BSDebugDiagnostic[]);
    private emit(
        /* eslint-disable @typescript-eslint/indent */
        eventName:
            'app-exit' |
            'app-ready' |
            'cannot-continue' |
            'chanperf' |
            'close' |
            'connected' |
            'console-output' |
            'rendezvous' |
            'runtime-error' |
            'start' |
            'suspend' |
            'unhandled-console-output' |
            'device-unresponsive',
        /* eslint-enable @typescript-eslint/indent */
        data?);
    private emit(eventName: string, data?) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            if (this.emitter) {
                this.emitter.emit(eventName, data);
            }
        }, 0);
    }

    /**
     * The debugger needs to tell us when to be active (i.e. when the package was deployed)
     */
    public isActivated = false;

    /**
     * This will be set to true When the roku emits the [scrpt.ctx.run.enter] text,
     * which indicates that the app is running on the Roku
     */
    public isAppRunning = false;
    /**
     * Every time we get a message that ends with the debugger prompt,
     * this will be set to true. Otherwise, it will be set to false
     */
    public isAtDebuggerPrompt = false;

    public async activate() {
        this.logger.log('Activate TelnetAdapter');
        this.isActivated = true;
        await this.handleStartupIfReady();
    }

    public async sendErrors() {
        await this.compileErrorProcessor.sendErrors();
    }

    private async handleStartupIfReady() {
        if (this.isActivated && this.isAppRunning) {
            this.logger.log('Handling startup');
            this.emit('start');

            //if we are already sitting at a debugger prompt, we need to emit the first suspend event.
            //If not, then there are probably still messages being received, so let the normal handler
            //emit the suspend event when it's ready
            if (this.isAtDebuggerPrompt === true) {
                this.logger.log(`At debug prompt, so trigger the 'suspend' event`);
                let threads = await this.getThreads();
                this.emit('suspend', threads[0]?.threadId);
            }
        }
    }

    /**
     * Wait until the client has stopped sending messages. This is used mainly during .connect so we can ignore all old messages from the server
     * @param client
     * @param maxWaitMilliseconds
     */
    private settleTelnetConnection(client: Socket, maxWaitMilliseconds = 400) {
        const startTime = new Date();
        this.logger.log('Waiting for telnet client to settle');
        return new Promise<string>((resolve) => {
            let timeoutStarted = false;
            let callCount = -1;
            let logs = '';

            const handler = (buffer) => {
                callCount++;
                logs += buffer.toString();
                let myCallCount = callCount;
                timeoutStarted = true;
                setTimeout(() => {
                    if (myCallCount === callCount) {
                        // stop listening for data events
                        client.removeListener('data', handler);
                        this.logger.log(`Telnet client has settled after ${new Date().getTime() - startTime.getTime()} milliseconds`);
                        resolve(logs);
                    }
                }, maxWaitMilliseconds);
            };

            const startTimeout = () => {
                if (timeoutStarted === false) {
                    handler(Buffer.from(''));
                }
            };

            // watch for data events
            client.on('data', handler);

            // watch for different connection related events to start the timeout logic
            client.on('ready', startTimeout);
            client.on('end', startTimeout);
            client.on('closed', startTimeout);
        });
    }

    private processBreakpoints(text: string) {
        let newLines = text.split(/\r?\n/g);
        for (const line of newLines) {
            //Running processing line
            if (this.debugStartRegex.exec(line)) {
                //start MicroDebugger block
                this.isInMicroDebugger = true;
                this.isNextBreakpointSkipped = false;
            } else if (this.isInMicroDebugger && this.debugEndRegex.exec(line)) {
                //ended MicroDebugger block
                this.isInMicroDebugger = false;
            } else if (this.isInMicroDebugger) {
                if (this.options.enableDebuggerAutoRecovery && line.startsWith('Break in ')) {
                    //this block is a break: skipping it
                    this.isNextBreakpointSkipped = true;
                }
            }
        }
    }

    private firstConnectDeferred = defer<void>();

    public onReady() {
        return this.firstConnectDeferred.promise;
    }

    /**
     * Connect to the telnet session. This should be called before the channel is launched.
     */
    public async connect() {
        this.logger.log('Establishing telnet connection');
        let deferred = defer();
        this.isInMicroDebugger = false;
        this.isNextBreakpointSkipped = false;
        try {
            this.logger.log('Pressing home button');
            //force roku to return to home screen. This gives the roku adapter some security in knowing new messages won't be appearing during initialization
            await rokuDeploy.pressHomeButton(this.options.host, this.options.remotePort);
            let telnetSocket: Socket = new Socket({ allowHalfOpen: false });
            util.registerSocketLogging(telnetSocket, this.logger, 'TelnetSocket');

            //listen for the close event
            telnetSocket.on('close', () => {
                this.emit('close');
            });

            //if the connection fails, reject the connect promise
            telnetSocket.on('error', (err) => {
                deferred.reject(new Error(`Error with connection to: ${this.options.host}:${this.options.brightScriptConsolePort} \n\n ${err.message} `));
            });

            const settlePromise = this.settleTelnetConnection(telnetSocket);
            telnetSocket.connect(this.options.brightScriptConsolePort, this.options.host, () => {
                this.logger.log(`Telnet connection established to ${this.options.host}:${this.options.brightScriptConsolePort}`);
                this.connected = true;
                this.connectionDeferred.resolve();
                this.emit('connected', this.connected);
            });

            const settledLogs = await settlePromise;
            if (settledLogs.trim().startsWith('Console connection is already in use.')) {
                throw new SocketConnectionInUseError(`Telnet connection ${this.options.host}:${this.options.brightScriptConsolePort} already is use`, {
                    port: this.options.brightScriptConsolePort,
                    host: this.options.host
                });
            }

            //hook up the pipeline to the socket
            this.requestPipeline = new TelnetRequestPipeline(telnetSocket);
            this.requestPipeline.connect();

            let lastPartialLine = '';
            //forward all raw console output
            this.requestPipeline.on('console-output', (output) => {
                this.processBreakpoints(output);
                let logResult = util.handleLogFragments(lastPartialLine, output);

                // Save any remaining partial line for the next event
                lastPartialLine = logResult.remaining;
                if (logResult.completed) {
                    // Emit the completed io string.
                    this.emit('console-output', logResult.completed);
                } else {
                    this.logger.debug('Buffer was split', lastPartialLine);
                }
            });

            //listen for any compile errors
            this.compileErrorProcessor.on('diagnostics', (errors) => {
                this.emit('diagnostics', errors);
            });

            //listen for any console output that was not handled by other methods in the adapter
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.requestPipeline.on('unhandled-console-output', async (responseText: string) => {
                //if there was a runtime error, handle it
                let hasRuntimeError = this.checkForRuntimeError(responseText);

                responseText = this.chanperfTracker.processLog(responseText);
                responseText = await this.rendezvousTracker.processLog(responseText);
                //forward all unhandled console output
                this.processBreakpoints(responseText);
                if (responseText) {
                    this.emit('unhandled-console-output', responseText);
                }

                // short circuit after the output has been sent as console output
                if (hasRuntimeError) {
                    this.logger.log('Detected runtime error in output', { responseText });
                    this.isAtDebuggerPrompt = true;
                    return;
                }

                this.compileErrorProcessor.processUnhandledLines(responseText);

                if (this.isAtCannotContinue(responseText)) {
                    this.logger.log('is at cannot continue');
                    this.isAtDebuggerPrompt = true;
                    return;
                }

                //emitting this signal so the BrightScriptDebugSession will successfully complete it's publish method.
                if (/\[beacon.signal\] \|AppCompileComplete/i.exec(responseText.trim())) {
                    this.emit('app-ready');
                }

                if (this.isActivated) {
                    //watch for the start of the program
                    if (/\[scrpt.ctx.run.enter\]/i.exec(responseText.trim()) || /Backtrace:/i.exec(responseText.trim())) {
                        this.isAppRunning = true;
                        this.logger.log('Running beacon detected', { responseText });
                        void this.handleStartupIfReady();
                    }

                    //watch for the end of the program
                    if (/\[beacon.report\] \|AppExitComplete/i.exec(responseText.trim())) {
                        this.beginAppExit();
                    }

                    //watch for debugger prompt output
                    if (util.endsWithDebuggerPrompt(responseText)) {
                        this.logger.log('Debugger prompt detected in', { responseText });

                        //if we are activated AND this is the first time seeing the debugger prompt since a continue/step action
                        if (this.isNextBreakpointSkipped) {
                            this.logger.log('This debugger is flagged to be skipped');
                            this.isInMicroDebugger = false;
                            this.isNextBreakpointSkipped = false;
                            void this.requestPipeline.executeCommand('c', { waitForPrompt: false, insertAtFront: true });
                        } else {
                            if (this.isActivated && this.isAtDebuggerPrompt === false) {
                                this.isAtDebuggerPrompt = true;
                                this.logger.log('Sending the "suspend" event to the client');
                                this.emit('suspend');
                            } else {
                                this.logger.log('Skipping "suspend" event because we are already suspended');
                                this.isAtDebuggerPrompt = true;
                            }
                        }
                    } else {
                        this.logger.debug('responseText does not end with debugger prompt. isAtDebuggerPrompt = false', { responseText });
                        this.isAtDebuggerPrompt = false;
                    }
                }
            });

            this.requestPipeline.on('device-unresponsive', (data: { lastCommand: string }) => {
                this.emit('device-unresponsive', data);
            });

            //the adapter is connected and running smoothly. resolve the promise
            deferred.resolve();
        } catch (e) {
            deferred.reject(e);
        }
        this.firstConnectDeferred.resolve();
        return deferred.promise;
    }

    private beginAppExit() {
        this.logger.log('Beginning app exit');
        this.compileErrorProcessor.compileErrorTimer = setTimeout(() => {
            this.logger.info('emitting app-exit');
            this.isAppRunning = false;
            this.emit('app-exit');
        }, 200);
    }

    /**
     * Look through response text for the "Can't continue" text
     * @param responseText
     */
    private isAtCannotContinue(responseText: string) {
        if (/^can't continue$/gim.exec(responseText.trim())) {
            this.emit('cannot-continue');
            return true;
        } else {
            return false;
        }
    }

    /**
     * Look through the given response text for a runtime error
     * @param responseText
     */
    private checkForRuntimeError(responseText: string) {
        let match = /(.*)\s\(runtime\s+error\s+(.*)\)\s+in/.exec(responseText);
        if (match) {
            let message = match[1].trim();
            let errorCode = match[2].trim().toLowerCase();
            //if the codes encountered are the STOP or scriptBreak() calls, skip them
            if (errorCode === '&hf7' || errorCode === '&hf8') {
                return false;
            }
            this.emit('runtime-error', <BrightScriptRuntimeError>{
                message: message,
                errorCode: errorCode
            });
            return true;
        } else {
            return false;
        }
    }

    /**
     * Send command to step over
     */
    public stepOver() {
        this.logger.log('stepOver');
        this.clearCache(true);
        return this.requestPipeline.executeCommand('over', { waitForPrompt: false, insertAtFront: true });
    }

    public stepInto() {
        this.logger.log('stepInto');
        this.clearCache(true);
        return this.requestPipeline.executeCommand('step', { waitForPrompt: false, insertAtFront: true });
    }

    public stepOut() {
        this.logger.log('stepOut');
        this.clearCache(true);
        return this.requestPipeline.executeCommand('out', { waitForPrompt: false, insertAtFront: true });

    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public continue() {
        this.logger.log('continue');
        this.clearCache(true);
        return this.requestPipeline.executeCommand('c', { waitForPrompt: false, insertAtFront: true });
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public pause() {
        this.logger.log('pause');
        this.clearCache(true);
        //send the kill signal, which breaks into debugger mode. This gets written immediately, regardless of debugger prompt status.
        this.requestPipeline.write('\x03;');
    }

    /**
     * Clears the state, which means that everything will be retrieved fresh next time it is requested
     */
    public clearCache(clearStackFrameCache = false) {
        this.logger.info('Clearing TelnetAdapter cache');
        this.cache = {};
        this.isAtDebuggerPrompt = false;
        if (clearStackFrameCache) {
            this.stackFramesCache = {};
        }
    }

    /**
     * Execute a command directly on the roku. Returns the output of the command.
     * @param command the command to execute. If the command does not start with `print` the command will be prefixed with `print ` because
     */
    public async evaluate(command: string): Promise<RokuAdapterEvaluateResponse> {
        this.logger.log('evaluate ', { command });
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot run evaluate: debugger is not paused');
        }
        //clear the cache (we don't know what command the user entered)
        this.clearCache();
        //don't wait for the output...we don't know what command the user entered
        let responseText = await this.requestPipeline.executeCommand(command, { waitForPrompt: true });
        //we know that if we got a response, we are back at a debugger prompt
        this.isAtDebuggerPrompt = true;
        return {
            message: responseText,
            type: 'message'
        };
    }

    public async getStackTrace() {
        this.logger.log(TelnetAdapter.prototype.getStackTrace.name);
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return this.resolve('stackTrace', async () => {
            //perform a request to load the stack trace
            let responseText = (await this.requestPipeline.executeCommand('bt', { waitForPrompt: true })).trim();
            let regexp = /#(\d+)\s+(?:function|sub)\s+([\$\w\d]+).*\s+file\/line:\s+(.*)\((\d+)\)/ig;
            let matches: RegExpExecArray;
            let frames: StackFrame[] = [];
            while ((matches = regexp.exec(responseText))) {
                //the first index is the whole string
                //then the matches should be in pairs
                for (let i = 1; i < matches.length; i += 4) {
                    let j = 1;
                    let frameId = parseInt(matches[i]);
                    let functionIdentifier = matches[i + j++];
                    let filePath = matches[i + j++];
                    let lineNumber = parseInt(matches[i + j++]);
                    let frame: StackFrame = {
                        frameId: frameId,
                        filePath: filePath,
                        lineNumber: lineNumber,
                        functionIdentifier: functionIdentifier
                    };
                    frames.push(frame);
                    this.stackFramesCache[frame.frameId] = frame;
                }
            }
            //if we didn't find frames yet, then there's not much more we can do...
            return frames;
        });
    }

    public getStackFrameById(frameId: number): StackFrame {
        return this.stackFramesCache[frameId];
    }

    /**
     * Runs a regex to check if the target is an object and get the type if it is
     * @param value
     */
    private getObjectType(value: string) {
        const match = /<.*?:\s*(\w+\s*\:*\s*[\w\.]*)>/gi.exec(value);
        if (match) {
            return match[1];
        } else {
            return null;
        }
    }

    /**
     * Runs a regex to get the first work of a line
     * @param value
     */
    private getFirstWord(value: string) {
        return /^([\w.\-=]*)\s/.exec(value);
    }

    /**
     * Gets a string array of all the local variables using the var command
     */
    public async getScopeVariables() {
        this.logger.log('getScopeVariables');
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }
        return this.resolve(`Scope Variables`, async () => {
            let data: string;
            let vars = [] as string[];

            data = await this.requestPipeline.executeCommand(`var`, { waitForPrompt: true });
            let splitData = data.trim().split('\n');

            for (const line of splitData) {
                let match: RegExpExecArray;
                if (!line.includes('Brightscript Debugger') && (match = this.getFirstWord(line))) {
                    // There seems to be a local ifGlobal interface variable under the name of 'global' but it
                    // is not accessible by the channel. Stript it our.
                    if ((match[1] !== 'global') && match[1].length > 0) {
                        vars.push(match[1]);
                    }
                }
            }
            return vars;
        });
    }

    /**
     * Given an expression, evaluate that statement ON the roku
     * @param expression
     * @param frameId unused but added to match signature of DebugProtocolAdapter
     */
    public async getVariable(expression: string, frameId = -1) {
        const logger = this.logger.createLogger('[getVariable]');
        logger.info('begin', { expression });
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }
        let expressionType = await this.getVariableType(expression);

        let lowerExpressionType = expressionType ? expressionType.toLowerCase() : null;

        let data: string;
        //if the expression type is a string, we need to wrap the expression in quotes BEFORE we run the print so we can accurately capture the full string value
        if (lowerExpressionType === 'string' || lowerExpressionType === 'rostring') {
            data = await this.requestPipeline.executeCommand(`print "--string-wrap--" + ${expression} + "--string-wrap--"`, { waitForPrompt: true });

            //write a for loop to print every value from the array. This gets around the `...` after the 100th item issue in the roku print call
        } else if (['roarray', 'rolist', 'roxmllist', 'robytearray'].includes(lowerExpressionType)) {
            const command = [
                `for each vscodeLoopItem in ${expression} : print ` +
                `   "vscode_type_start:" + type(vscodeLoopItem) + ":vscode_type_stop "`,
                `   "vscode_is_string:"; (invalid <> GetInterface(vscodeLoopItem, "ifString"))`,
                `   vscodeLoopItem :` +
                ` end for`
            ].join(';');
            data = await this.requestPipeline.executeCommand(command, { waitForPrompt: true });
        } else if (['roassociativearray', 'rosgnode'].includes(lowerExpressionType)) {
            const command = [
                `for each vscodeLoopKey in ${expression}.keys(): print` +
                `   "vscode_key_start:" + vscodeLoopKey + ":vscode_key_stop "`,
                `   "vscode_type_start:" + type(${expression}[vscodeLoopKey]) + ":vscode_type_stop "`,
                `   "vscode_is_string:"; (invalid <> GetInterface(${expression}[vscodeLoopKey], "ifString"))`,
                `   ${expression}[vscodeLoopKey] :` +
                ' end for'
            ].join(';');
            data = await this.requestPipeline.executeCommand(command, { waitForPrompt: true });
        } else {
            data = await this.requestPipeline.executeCommand(`print ${expression}`, { waitForPrompt: true });
        }

        logger.info('expression details', { data });
        //remove excess whitespace
        data = data.trim();
        if (lowerExpressionType === 'string' || lowerExpressionType === 'rostring') {
            data = data.trim().replace(/--string-wrap--/g, '');
            //add an escape character in front of any existing quotes
            data = data.replace(/"/g, '\\"');
            //wrap the string value with literal quote marks
            data = '"' + data + '"';
        }
        let highLevelType = this.getHighLevelType(expressionType);

        let children: EvaluateContainer[];
        if (highLevelType === HighLevelType.array || ['roassociativearray', 'rosgnode', 'roxmllist', 'robytearray'].includes(lowerExpressionType)) {
            //the print statment will always have 1 trailing newline, so remove that.
            data = util.removeTrailingNewline(data);
            //the array/associative array print is a loop of every value, so handle that
            children = this.getForLoopPrintedChildren(expression, data);
            children.push({
                name: '$count',
                value: children.length.toString(),
                type: 'integer',
                highLevelType: HighLevelType.primative,
                evaluateName: children.length.toString(),
                presentationHint: { kind: 'virtual' },
                keyType: KeyType.legacy,
                children: undefined
            });
        } else if (highLevelType === HighLevelType.object) {
            children = this.getObjectChildren(expression, data.trim());
        } else if (highLevelType === HighLevelType.unknown) {
            logger.warn('there was an issue evaluating this variable', { expression });
            data = '<UNKNOWN>';
        }

        if (['rostring', 'roint', 'rointeger', 'rolonginteger', 'rofloat', 'rodouble', 'roboolean', 'rointrinsicdouble'].includes(lowerExpressionType)) {
            return <EvaluateContainer>{
                name: expression,
                value: util.removeTrailingNewline(data),
                type: expressionType,
                highLevelType: HighLevelType.primative,
                evaluateName: expression,
                children: []
            };
        }

        //add a computed `[[children]]` property to allow expansion of node children
        if (lowerExpressionType === 'rosgnode') {
            let nodeChildren: EvaluateContainer = {
                name: '$children',
                type: 'roArray',
                highLevelType: HighLevelType.array,
                presentationHint: { kind: 'virtual' },
                evaluateName: `${expression}.getChildren(-1, 0)`,
                children: []
            };
            children.push(nodeChildren);
        }

        //xml elements won't display on their own, so we need to create some sub elements
        if (lowerExpressionType === 'roxmlelement') {
            children.push({
                //look up the name of the xml element
                ...await this.getVariable(`${expression}.GetName()`),
                name: '$name',
                presentationHint: { kind: 'virtual' }
            });

            children.push({
                name: '$attributes',
                type: 'roAssociativeArray',
                highLevelType: HighLevelType.array,
                evaluateName: `${expression}.GetAttributes()`,
                presentationHint: { kind: 'virtual' },
                children: []
            });

            //add a computed `[[children]]` property to allow expansion of child elements
            children.push({
                name: '$children',
                type: 'roArray',
                highLevelType: HighLevelType.array,
                evaluateName: `${expression}.GetChildNodes()`,
                presentationHint: { kind: 'virtual' },
                children: []
            });
        }

        //if this item is an array or a list, add the item count to the end of the type
        if (highLevelType === HighLevelType.array) {
            //TODO re-enable once we find how to refresh watch/variables panel, since lazy loaded arrays can't show a length
            //expressionType += `(${children.length})`;
        }

        let container = <EvaluateContainer>{
            name: expression,
            evaluateName: expression,
            type: expressionType,
            value: data.trim(),
            highLevelType: highLevelType,
            children: children
        };
        logger.info('end', { container });
        return container;
    }

    /**
     * In order to get around the `...` issue in printed arrays, `getVariable` now prints every value from an array or associative array in a for loop.
     * As such, we need to iterate over every printed result to produce the children array
     */
    private getForLoopPrintedChildren(expression: string, data: string) {
        let children: EvaluateContainer[] = [];
        let lines = data.split(/\r?\n/g);
        //if there are no lines, this is an empty object/array
        if (lines.length === 1 && lines[0].trim() === '') {
            return children;
        }
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            let line = lines[lineIndex];

            let keyStartWrapper = 'vscode_key_start:';
            let keyStopWrapper = ':vscode_key_stop ';

            let child = <EvaluateContainer>{
                children: []
            };

            const keyStartIdx = line.indexOf(keyStartWrapper);
            //if the key is present, extract it
            if (keyStartIdx > -1) {
                child.name = line.substring(keyStartIdx + keyStartWrapper.length, line.indexOf(keyStopWrapper));
                child.evaluateName = `${expression}["${child.name}"]`;

                //throw out the key chunk
                line = line.substring(line.indexOf(keyStopWrapper) + keyStopWrapper.length);

            } else {
                child.name = children.length.toString();
                child.evaluateName = `${expression}[${children.length}]`;
            }

            //get the object type
            let typeStartWrapper = 'vscode_type_start:';
            let typeStopWrapper = ':vscode_type_stop ';
            let type: string;

            const typeStartIndex = line.indexOf(typeStartWrapper);
            //if the type is present, extract it
            if (typeStartIndex > -1) {
                type = line.substring(typeStartIndex + typeStartWrapper.length, line.indexOf(typeStopWrapper));

                //throw out the type chunk
                line = line.substring(line.indexOf(typeStopWrapper) + typeStopWrapper.length);
            }

            if (line.includes('vscode_is_string:true')) {
                line = line.replace('vscode_is_string:true', '');
                //support multi-line strings
                let stringLines = [line];

                //go one past the final line so that we can more easily detect the end of the input
                for (lineIndex; lineIndex < lines.length; lineIndex++) {
                    //go one past (since we already have current line. Also, because we want to run off the end of the list
                    //so we can know there are no more lines
                    let nextLine = lines[lineIndex + 1];
                    if (nextLine === undefined || (nextLine?.trimLeft().startsWith('vscode_'))) {
                        break;
                    } else {
                        stringLines.push(nextLine);
                    }
                }
                line = '"' + stringLines.join('\n') + '"';
            } else {
                line = line.replace('vscode_is_string:false', '');
            }

            //skip empty lines
            if (line.trim() === '') {
                continue;
            }

            const objectType = this.getObjectType(line);
            //handle collections
            if (this.isScrapableContainObject(objectType)) {
                let collectionEnd: ')' | ']' | '}';
                if (line.includes('<Component: roList>')) {
                    collectionEnd = ')';
                    child.highLevelType = HighLevelType.array;
                    child.type = objectType;
                } else if (line.includes('<Component: roArray>')) {
                    collectionEnd = ']';
                    child.highLevelType = HighLevelType.array;
                    child.type = this.getObjectType(line);
                } else if (line.includes('<Component: roByteArray>')) {
                    collectionEnd = ']';
                    child.highLevelType = HighLevelType.array;
                    child.type = this.getObjectType(line);
                } else if (line.includes('<Component: roAssociativeArray>') || objectType?.startsWith('roSGNode')) {
                    collectionEnd = '}';
                    child.highLevelType = HighLevelType.object;
                    child.type = this.getObjectType(line);
                }

                let collectionLineList = [line];
                for (lineIndex += 1; lineIndex < lines.length; lineIndex++) {
                    let innerLine = lines[lineIndex];

                    collectionLineList.push(lines[lineIndex]);

                    //stop collecting lines
                    if (innerLine.trim() === collectionEnd) {
                        break;
                    }
                }
                //we have reached the end of the collection. scrap children because they need evaluated in a separate call to compute their types
                child.children = [];

                //this if block must pre-seek the `line.indexOf('<Component') > -1` line because roInvalid is a component too.
            } else if (objectType === 'roInvalid') {
                child.highLevelType = HighLevelType.uninitialized;
                child.type = 'roInvalid';
                child.value = 'roInvalid';
                child.children = undefined;

            } else if (line.includes('<Component:')) {
                //handle things like nodes
                child.highLevelType = HighLevelType.object;
                child.type = objectType;

            } else {
                //is some primative type
                child.type = type;
                child.value = line.trim();
                child.highLevelType = HighLevelType.primative;
                child.children = undefined;
            }
            children.push(child);
        }
        let sortedChildren = orderBy(children, ['name']);
        return sortedChildren;
    }

    private getPrimativeTypeFromValue(value: string): PrimativeType {
        value = value ? value.toLowerCase() : value;
        if (!value || value === 'invalid') {
            return PrimativeType.invalid;
        }
        if (value === 'true' || value === 'false') {
            return PrimativeType.boolean;
        }
        if (value.includes('"')) {
            return PrimativeType.string;
        }
        if (value.split('.').length > 1) {
            return PrimativeType.integer;
        } else {
            return PrimativeType.float;
        }

    }

    public isScrapableContainObject(objectType: string) {
        const isRoSGNode = objectType?.startsWith('roSGNode');
        //handle collections
        return (['roList', 'roArray', 'roAssociativeArray', 'roByteArray'].includes(objectType) || isRoSGNode);
    }

    private getObjectChildren(expression: string, data: string): EvaluateContainer[] {
        try {
            let children: EvaluateContainer[] = [];
            //split by newline. the object contents start at index 2
            let lines = data.split(/\r?\n/g);
            for (let i = 2; i < lines.length; i++) {
                let line = lines[i];
                let trimmedLine = line.trim();

                //if this is the end of the object, we are finished collecting children. exit
                if (trimmedLine === '}') {
                    return children;
                }
                let child: EvaluateContainer;
                //parse the line (try and determine the key and value)
                let lineParseResult = new PrintedObjectParser(line).result;
                if (!lineParseResult) {
                    //skip this line because something strange happened, or we encountered the `...`
                    child = {
                        name: line,
                        type: '<ERROR>',
                        highLevelType: HighLevelType.uninitialized,
                        evaluateName: undefined,
                        value: '<ERROR>',
                        keyType: KeyType.legacy,
                        children: []
                    };
                } else {
                    child = <EvaluateContainer>{
                        name: lineParseResult.key,
                        evaluateName: `${expression}.${lineParseResult.key}`,
                        children: []
                    };

                    const type = this.getObjectType(trimmedLine);
                    //if the line is an object, array or function
                    if (type) {
                        child.type = type;
                        child.highLevelType = this.getHighLevelType(type);
                        child.value = type;
                    } else {
                        child.type = this.getPrimativeTypeFromValue(trimmedLine);
                        child.value = lineParseResult.value;
                        child.highLevelType = HighLevelType.primative;
                    }
                }

                children.push(child);
            }
            return children;
        } catch (e) {
            throw new Error(`Unable to parse BrightScript object: ${JSON.stringify(e.message)}. Data: ${data}`);
        }
    }

    /**
     * Determine if this value is a primative type
     * @param expressionType
     */
    private getHighLevelType(expressionType: string) {
        if (!expressionType) {
            return HighLevelType.unknown;
        }

        expressionType = expressionType.toLowerCase();
        let primativeTypes = ['boolean', 'integer', 'longinteger', 'float', 'double', 'string', 'rostring', 'invalid'];
        if (primativeTypes.includes(expressionType)) {
            return HighLevelType.primative;
        } else if (expressionType === 'roarray' || expressionType === 'rolist') {
            return HighLevelType.array;
        } else if (expressionType === 'function') {
            return HighLevelType.function;
        } else if (expressionType === '<uninitialized>') {
            return HighLevelType.uninitialized;
        } else {
            return HighLevelType.object;
        }
    }

    /**
     * Get the type of the provided expression
     * @param expression
     */
    public async getVariableType(expression: string) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get variable type: debugger is not paused');
        }
        expression = `Type(${expression})`;
        return this.resolve(`${expression}`, async () => {
            let data = await this.requestPipeline.executeCommand(`print ${expression}`, { waitForPrompt: true });

            //remove whitespace
            return data?.trim() ?? null;
        });
    }

    /**
     * Cache items by a unique key
     * @param expression
     * @param factory
     */
    private resolve<T>(key: string, factory: () => T | Thenable<T>): Promise<T> {
        try {
            if (this.cache[key]) {
                this.logger.debug(`resolve cache "${key}": already exists`);
                return this.cache[key];
            } else {
                this.logger.debug(`resolve cache "${key}": calling factory`);
                const result = factory();
                this.cache[key] = Promise.resolve<T>(result);
                return this.cache[key];
            }
        } catch (e) {
            return Promise.reject(e);
        }
    }

    /**
     * Get a list of threads. The first thread in the list is the active thread
     */
    public async getThreads() {
        this.logger.log('getThreads');
        if (!this.isAtDebuggerPrompt) {
            this.logger.log('Cannot get threads: debugger is not paused');
            return [];
        }
        return this.resolve('threads', async () => {
            let data = await this.requestPipeline.executeCommand('threads', { waitForPrompt: true });

            let dataString = data.toString().trim();
            let matches = /^\s+(\d+\*)\s+(.*)\((\d+)\)\s+(.*)/gm.exec(dataString);
            let threads: Thread[] = [];
            if (matches) {
                //skip index 0 because it's the whole string
                for (let i = 1; i < matches.length; i += 4) {
                    let threadId: string = matches[i];
                    let thread = <Thread>{
                        isSelected: false,
                        filePath: matches[i + 1],
                        lineNumber: parseInt(matches[i + 2]),
                        lineContents: matches[i + 3]
                    };
                    if (threadId.includes('*')) {
                        thread.isSelected = true;
                        threadId = threadId.replace('*', '');
                    }
                    thread.threadId = parseInt(threadId);
                    threads.push(thread);
                }
                //make sure the selected thread is at the top
                threads.sort((a, b) => {
                    return a.isSelected ? -1 : 1;
                });
            }
            return threads;
        });
    }

    public removeAllListeners() {
        this.emitter?.removeAllListeners();
    }

    /**
     * Indicates whether this class has had `.destroy()` called at least once. Mostly used for checking externally to see if
     * the whole debug session has been terminated or is in a bad state.
     */
    public isDestroyed = false;
    /**
     * Disconnect from the telnet session and unset all objects
     */
    public destroy() {
        this.isDestroyed = true;

        if (this.requestPipeline) {
            this.requestPipeline.destroy();
        }

        this.requestPipeline = undefined;
        this.cache = undefined;
        if (this.emitter) {
            this.emitter.removeAllListeners();
        }
        this.emitter = undefined;
        //needs to be async to match the DebugProtocolAdapter implementation
        return Promise.resolve();
    }

    /**
     * Passes the log level down to the RendezvousTracker and ChanperfTracker
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.chanperfTracker.setConsoleOutput(outputLevel);
        this.rendezvousTracker.setConsoleOutput(outputLevel);
    }

    /**
     * Sends a call to the RendezvousTracker to clear the current rendezvous history
     */
    public clearRendezvousHistory() {
        this.rendezvousTracker.clearHistory();
    }

    /**
     * Sends a call to the ChanperfTracker to clear the current chanperf history
     */
    public clearChanperfHistory() {
        this.chanperfTracker.clearHistory();
    }

    public async setExceptionBreakpoints(filters: ExceptionBreakpoint[]) {
        //we can't send dynamic breakpoints to the server...so just do nothing
    }

    public async syncBreakpoints() {
        //we can't send dynamic breakpoints to the server...so just do nothing
    }

    public isTelnetAdapter(): this is TelnetAdapter {
        return true;
    }

    public isDebugProtocolAdapter(): this is DebugProtocolAdapter {
        return false;
    }
}

export interface StackFrame {
    frameId: number;
    filePath: string;
    lineNumber: number;
    functionIdentifier: string;
}

export enum EventName {
    suspend = 'suspend'
}

export enum KeyType {
    string = 'String',
    integer = 'Integer',
    legacy = 'Legacy'
}

export interface Thread {
    /**
     * Is this thread selected
     */
    isSelected: boolean;
    /**
     * The 1-based line number
     */
    lineNumber: number;
    /**
     * The pkgPath to the file on-device
     */
    filePath: string;
    /**
     * The contents of the line (i.e. the code for the line)
     */
    lineContents: string;
    /**
     * The id of this thread
     */
    threadId: number;
}

export enum PrimativeType {
    invalid = 'Invalid',
    boolean = 'Boolean',
    string = 'String',
    integer = 'Integer',
    float = 'Float'
}

interface BrightScriptRuntimeError {
    message: string;
    errorCode: string;
}
