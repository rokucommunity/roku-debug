import type { ProtocolVersionDetails } from '../debugProtocol/Debugger';
import { Debugger } from '../debugProtocol/Debugger';
import * as EventEmitter from 'events';
import { Socket } from 'net';
import { CompileErrorProcessor } from '../CompileErrorProcessor';
import type { RendezvousHistory } from '../RendezvousTracker';
import { RendezvousTracker } from '../RendezvousTracker';
import type { ChanperfData } from '../ChanperfTracker';
import { ChanperfTracker } from '../ChanperfTracker';
import type { SourceLocation } from '../managers/LocationManager';
import { PROTOCOL_ERROR_CODES } from '../debugProtocol/Constants';
import { util, defer } from '../util';
import { logger } from '../logging';
import type { HighLevelType } from '../interfaces';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class DebugProtocolAdapter {
    constructor(
        private host: string,
        private stopOnEntry: boolean = false
    ) {
        this.emitter = new EventEmitter();
        this.chanperfTracker = new ChanperfTracker();
        this.rendezvousTracker = new RendezvousTracker();
        this.compileErrorProcessor = new CompileErrorProcessor();

        // watch for chanperf events
        this.chanperfTracker.on('chanperf', (output) => {
            this.emit('chanperf', output);
        });

        // watch for rendezvous events
        this.rendezvousTracker.on('rendezvous', (output) => {
            this.emit('rendezvous', output);
        });
    }

    private logger = logger.createLogger(`[${DebugProtocolAdapter.name}]`);

    public connected: boolean;

    private compileClient: Socket;
    private compileErrorProcessor: CompileErrorProcessor;
    private emitter: EventEmitter;
    private chanperfTracker: ChanperfTracker;
    private rendezvousTracker: RendezvousTracker;
    private socketDebugger: Debugger;
    private nextFrameId = 1;

    private stackFramesCache: Record<number, StackFrame> = {};
    private cache = {};

    /**
     * Get the version of the protocol for the Roku device we're currently connected to.
     */
    public get activeProtocolVersion() {
        return this.socketDebugger?.protocolVersion;
    }

    public readonly supportsMultipleRuns = false;

    /**
     * Subscribe to various events
     * @param eventName
     * @param handler
     */
    public on(eventName: 'cannot-continue', handler: () => void);
    public on(eventname: 'chanperf', handler: (output: ChanperfData) => void);
    public on(eventName: 'close', handler: () => void);
    public on(eventName: 'app-exit', handler: () => void);
    public on(eventName: 'compile-errors', handler: (params: { path: string; lineNumber: number }[]) => void);
    public on(eventName: 'connected', handler: (params: boolean) => void);
    public on(eventname: 'console-output', handler: (output: string) => void); // TODO: might be able to remove this at some point.
    public on(eventname: 'protocol-version', handler: (output: ProtocolVersionDetails) => void);
    public on(eventname: 'rendezvous', handler: (output: RendezvousHistory) => void);
    public on(eventName: 'runtime-error', handler: (error: BrightScriptRuntimeError) => void);
    public on(eventName: 'suspend', handler: () => void);
    public on(eventName: 'start', handler: () => void);
    public on(eventname: 'unhandled-console-output', handler: (output: string) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(
        /* eslint-disable */
        eventName:
            'app-exit' |
            'cannot-continue' |
            'chanperf' |
            'close' |
            'compile-errors' |
            'connected' |
            'console-output' |
            'protocol-version' |
            'rendezvous' |
            'runtime-error' |
            'start' |
            'suspend' |
            'unhandled-console-output',
        /* eslint-enable */
        data?
    ) {
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

    public async activate() {
        this.isActivated = true;
        await this.handleStartupIfReady();
    }

    public async sendErrors() {
        await this.compileErrorProcessor.sendErrors();
    }

    private async handleStartupIfReady() {
        if (this.isActivated && this.isAppRunning) {
            this.emit('start');

            //if we are already sitting at a debugger prompt, we need to emit the first suspend event.
            //If not, then there are probably still messages being received, so let the normal handler
            //emit the suspend event when it's ready
            if (this.isAtDebuggerPrompt === true) {
                let threads = await this.getThreads();
                this.emit('suspend', threads[0].threadId);
            }
        }
    }

    /**
     * Wait until the client has stopped sending messages. This is used mainly during .connect so we can ignore all old messages from the server
     * @param client
     * @param name
     * @param maxWaitMilliseconds
     */
    private settle(client: Socket, name: string, maxWaitMilliseconds = 400) {
        return new Promise((resolve) => {
            let callCount = -1;

            function handler() {
                callCount++;
                let myCallCount = callCount;
                setTimeout(() => {
                    //if no other calls have been made since the timeout started, then the listener has settled
                    if (myCallCount === callCount) {
                        client.removeListener(name, handler);
                        resolve(callCount);
                    }
                }, maxWaitMilliseconds);
            }

            client.addListener(name, handler);
            //call the handler immediately so we have a timeout
            handler();
        });
    }

    public get isAtDebuggerPrompt() {
        return this.socketDebugger ? this.socketDebugger.isStopped : false;
    }

    /**
     * Connect to the telnet session. This should be called before the channel is launched.
     */
    public async connect() {
        let deferred = defer();
        this.socketDebugger = new Debugger({
            host: this.host,
            stopOnEntry: this.stopOnEntry
        });
        try {
            // Emit IO from the debugger.
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.socketDebugger.on('io-output', async (responseText) => {
                if (responseText) {
                    responseText = this.chanperfTracker.processLog(responseText);
                    responseText = await this.rendezvousTracker.processLog(responseText);
                    this.emit('unhandled-console-output', responseText);
                    this.emit('console-output', responseText);
                }
            });

            // Emit IO from the debugger.
            this.socketDebugger.on('protocol-version', (data: ProtocolVersionDetails) => {
                if (data.errorCode === PROTOCOL_ERROR_CODES.SUPPORTED) {
                    this.emit('console-output', data.message);
                } else if (data.errorCode === PROTOCOL_ERROR_CODES.NOT_TESTED) {
                    this.emit('unhandled-console-output', data.message);
                    this.emit('console-output', data.message);
                } else if (data.errorCode === PROTOCOL_ERROR_CODES.NOT_SUPPORTED) {
                    this.emit('unhandled-console-output', data.message);
                    this.emit('console-output', data.message);
                }
            });

            // Listen for the close event
            this.socketDebugger.on('close', () => {
                this.emit('close');
                this.beginAppExit();
            });

            this.connected = await this.socketDebugger.connect();

            this.logger.log(`Closing telnet connection used for compile errors`);
            if (this.compileClient) {
                this.compileClient.removeAllListeners();
                this.compileClient.destroy();
                this.compileClient = undefined;
            }

            this.logger.log(`Connected to device`, { host: this.host, connected: this.connected });
            this.emit('connected', this.connected);

            // Listen for the app exit event
            this.socketDebugger.on('app-exit', () => {
                this.emit('app-exit');
            });

            this.socketDebugger.on('suspend', (data) => {
                this.emit('suspend', data);
            });

            this.socketDebugger.on('runtime-error', (data) => {
                console.debug('hasRuntimeError!!', data);
                this.emit('runtime-error', <BrightScriptRuntimeError>{
                    message: data.data.stopReasonDetail,
                    errorCode: data.data.stopReason
                });
            });

            this.socketDebugger.on('cannot-continue', () => {
                this.emit('cannot-continue');
            });

            //the adapter is connected and running smoothly. resolve the promise
            deferred.resolve();
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    private beginAppExit() {
        this.compileErrorProcessor.compileErrorTimer = setTimeout(() => {
            this.isAppRunning = false;
            this.emit('app-exit');
        }, 200);
    }

    public async watchCompileOutput() {
        let deferred = defer();
        try {
            this.compileClient = new Socket();
            this.compileErrorProcessor.on('compile-errors', (errors) => {
                this.compileClient.end();
                this.emit('compile-errors', errors);
            });

            //if the connection fails, reject the connect promise
            this.compileClient.addListener('error', (err) => {
                deferred.reject(new Error(`Error with connection to: ${this.host} \n\n ${err.message} `));
            });
            this.logger.info('Connecting via telnet to gether compile info', { host: this.host });
            this.compileClient.connect(8085, this.host, () => {
                this.logger.log(`Connected via telnet to gather compile info`, { host: this.host });
            });

            this.logger.debug('Waiting for the compile client to settle');
            await this.settle(this.compileClient, 'data');
            this.logger.debug('Compile client has settled');

            let lastPartialLine = '';
            this.compileClient.on('data', (buffer) => {
                let responseText = buffer.toString();
                this.logger.info('CompileClient received data', { responseText });
                if (!responseText.endsWith('\n')) {
                    this.logger.debug('Buffer was split');
                    // buffer was split, save the partial line
                    lastPartialLine += responseText;
                } else {
                    if (lastPartialLine) {
                        this.logger.debug('Previous response was split, so merging last response with this one', { lastPartialLine, responseText });
                        // there was leftover lines, join the partial lines back together
                        responseText = lastPartialLine + responseText;
                        lastPartialLine = '';
                    }
                    // Emit the completed io string.
                    this.compileErrorProcessor.processUnhandledLines(responseText.trim());
                    this.emit('unhandled-console-output', responseText.trim());
                }
            });

            // connected to telnet. resolve the promise
            deferred.resolve();
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    /**
     * Send command to step over
     */
    public async stepOver(threadId: number) {
        this.clearCache();
        return this.socketDebugger.stepOver(threadId);
    }

    public async stepInto(threadId: number) {
        this.clearCache();
        return this.socketDebugger.stepIn(threadId);
    }

    public async stepOut(threadId: number) {
        this.clearCache();
        return this.socketDebugger.stepOut(threadId);
    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public async continue() {
        this.clearCache();
        return this.socketDebugger.continue();
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public async pause() {
        this.clearCache();
        //send the kill signal, which breaks into debugger mode
        return this.socketDebugger.pause();
    }

    /**
     * Clears the state, which means that everything will be retrieved fresh next time it is requested
     */
    public clearCache() {
        this.cache = {};
        this.stackFramesCache = {};
    }

    /**
     * Execute a command directly on the roku. Returns the output of the command
     * @param command
     * @returns the output of the command (if possible)
     */
    public async evaluate(command: string, frameId: number = this.socketDebugger.primaryThread): Promise<string> {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot run evaluate: debugger is not paused');
        }

        let frame = this.getStackTraceById(frameId);
        if (!frame) {
            throw new Error('Cannot execute command without a corresponding frame');
        }
        this.logger.log('evaluate ', { command, frameId });
        // Pipe all evaluate requests though as a variable request as evaluate is not available at the moment.
        const response = await this.socketDebugger.executeCommand(command, frame.frameIndex, frame.threadIndex);
        this.logger.info('evaluate response', { command, response });
        return undefined;
    }

    public async getStackTrace(threadId: number = this.socketDebugger.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return this.resolve(`stack trace for thread ${threadId}`, async () => {
            let thread = await this.getThreadByThreadId(threadId);
            let frames: StackFrame[] = [];
            let stackTraceData: any = await this.socketDebugger.stackTrace(threadId);
            for (let i = 0; i < stackTraceData.stackSize; i++) {
                let frameData = stackTraceData.entries[i];
                let frame: StackFrame = {
                    frameId: this.nextFrameId++,
                    frameIndex: stackTraceData.stackSize - i - 1, // frame index is the reverse of the returned order.
                    threadIndex: threadId,
                    // eslint-disable-next-line no-nested-ternary
                    filePath: i === 0 ? (frameData.fileName) ? frameData.fileName : thread.filePath : frameData.fileName,
                    lineNumber: i === 0 ? thread.lineNumber : frameData.lineNumber,
                    // eslint-disable-next-line no-nested-ternary
                    functionIdentifier: this.cleanUpFunctionName(i === 0 ? (frameData.functionName) ? frameData.functionName : thread.functionName : frameData.functionName)
                };
                this.stackFramesCache[frame.frameId] = frame;
                frames.push(frame);
            }

            return frames;
        });
    }

    private getStackTraceById(frameId: number): StackFrame {
        return this.stackFramesCache[frameId];
    }

    private cleanUpFunctionName(functionName): string {
        return functionName.substring(functionName.lastIndexOf('@') + 1);
    }

    /**
     * Given an expression, evaluate that statement ON the roku
     * @param expression
     */
    public async getVariable(expression: string, frameId: number, withChildren = true) {
        const logger = this.logger.createLogger(' getVariable');
        logger.info('begin', { expression });
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }

        let frame = this.getStackTraceById(frameId);
        if (!frame) {
            throw new Error('Cannot request variable without a corresponding frame');
        }

        let variablePath = expression === '' ? [] : util.getVariablePath(expression);
        let response = await this.socketDebugger.getVariables(variablePath, withChildren, frame.frameIndex, frame.threadIndex);

        if (response.errorCode === 'OK') {
            let mainContainer: EvaluateContainer;
            let children: EvaluateContainer[] = [];
            let firstHandled = false;
            for (let variable of response.variables) {
                let value;
                let variableType = variable.variableType;
                if (variable.value === null) {
                    value = 'roInvalid';
                } else if (variableType === 'String') {
                    value = `\"${variable.value}\"`;
                } else {
                    value = variable.value;
                }

                if (variableType === 'Subtyped_Object') {
                    let parts = variable.value.split('; ');
                    variableType = `${parts[0]} (${parts[1]})`;
                } else if (variableType === 'AA') {
                    variableType = 'AssociativeArray';
                }

                let container = <EvaluateContainer>{
                    name: expression,
                    evaluateName: expression,
                    variablePath: variablePath,
                    type: variableType,
                    value: value,
                    keyType: variable.keyType,
                    elementCount: variable.elementCount
                };

                if (!firstHandled && variablePath.length > 0) {
                    firstHandled = true;
                    mainContainer = container;
                } else {
                    if (!firstHandled && variablePath.length === 0) {
                        // If this is a scope request there will be no entries in the variable path
                        // We will need to create a fake mainContainer
                        firstHandled = true;
                        mainContainer = <EvaluateContainer>{
                            name: expression,
                            evaluateName: expression,
                            variablePath: variablePath,
                            type: '',
                            value: null,
                            keyType: 'String',
                            elementCount: response.numVariables
                        };
                    }

                    let pathAddition = mainContainer.keyType === 'Integer' ? children.length : variable.name;
                    container.name = pathAddition.toString();
                    if (mainContainer.evaluateName) {
                        container.evaluateName = `${mainContainer.evaluateName}.${pathAddition}`;
                    } else {
                        container.evaluateName = pathAddition.toString();
                    }
                    container.variablePath = [].concat(container.variablePath, [pathAddition.toString()]);
                    if (container.keyType) {
                        container.children = [];
                    }
                    children.push(container);
                }
            }
            mainContainer.children = children;
            return mainContainer;
        }
    }

    /**
     * Cache items by a unique key
     * @param expression
     * @param factory
     */
    private resolve<T>(key: string, factory: () => T | Thenable<T>): Promise<T> {
        if (this.cache[key]) {
            return this.cache[key];
        }
        this.cache[key] = Promise.resolve<T>(factory());
        return this.cache[key];
    }

    /**
     * Get a list of threads. The first thread in the list is the active thread
     */
    public async getThreads() {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get threads: debugger is not paused');
        }
        return this.resolve('threads', async () => {
            let threads: Thread[] = [];
            let threadsData: any = await this.socketDebugger.threads();

            for (let i = 0; i < threadsData.threadsCount; i++) {
                let threadInfo = threadsData.threads[i];
                let thread = <Thread>{
                    // NOTE: On THREAD_ATTACHED events the threads request is marking the wrong thread as primary.
                    // NOTE: Rely on the thead index from the threads update event.
                    isSelected: this.socketDebugger.primaryThread === i,
                    // isSelected: threadInfo.isPrimary,
                    filePath: threadInfo.fileName,
                    functionName: threadInfo.functionName,
                    lineNumber: threadInfo.lineNumber + 1, //protocol is 0-based but 1-based is expected
                    lineContents: threadInfo.codeSnippet,
                    threadId: i
                };
                threads.push(thread);
            }
            //make sure the selected thread is at the top
            threads.sort((a, b) => {
                return a.isSelected ? -1 : 1;
            });

            return threads;
        });
    }

    private async getThreadByThreadId(threadId: number) {
        let threads = await this.getThreads();
        for (let thread of threads) {
            if (thread.threadId === threadId) {
                return thread;
            }
        }
    }

    /**
     * Disconnect from the telnet session and unset all objects
     */
    public async destroy() {
        if (this.socketDebugger) {
            // destroy might be called due to a compile error so the socket debugger might not exist yet
            await this.socketDebugger.exitChannel();
        }

        this.cache = undefined;
        if (this.emitter) {
            this.emitter.removeAllListeners();
        }
        this.emitter = undefined;
    }

    // #region Rendezvous Tracker pass though functions
    /**
     * Passes the debug functions used to locate the client files and lines to the RendezvousTracker
     */
    public registerSourceLocator(sourceLocator: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>) {
        this.rendezvousTracker.registerSourceLocator(sourceLocator);
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
    // #endregion
}

export interface StackFrame {
    frameId: number;
    frameIndex: number;
    threadIndex: number;
    filePath: string;
    lineNumber: number;
    functionIdentifier: string;
}

export enum EventName {
    suspend = 'suspend'
}

export interface EvaluateContainer {
    name: string;
    evaluateName: string;
    variablePath: string[];
    type: string;
    value: string;
    keyType: KeyType;
    elementCount: number;
    highLevelType: HighLevelType;
    children: EvaluateContainer[];
    presentationHint?: 'property' | 'method' | 'class' | 'data' | 'event' | 'baseClass' | 'innerClass' | 'interface' | 'mostDerivedClass' | 'virtual' | 'dataBreakpoint';
}

export enum KeyType {
    string = 'String',
    integer = 'Integer',
    legacy = 'Legacy'
}

export interface Thread {
    isSelected: boolean;
    lineNumber: number;
    filePath: string;
    functionName: string;
    lineContents: string;
    threadId: number;
}

interface BrightScriptRuntimeError {
    message: string;
    errorCode: string;
}
