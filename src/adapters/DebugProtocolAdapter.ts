import { Debugger, ProtocolVersionDetails, AddBreakpointRequestObject, RemoveBreakpointRequestObject } from '../debugProtocol/Debugger';
import * as eol from 'eol';
import * as EventEmitter from 'events';
import { Socket } from 'net';

import { defer } from '../debugSession/BrightScriptDebugSession';
import { CompileErrorProcessor } from '../CompileErrorProcessor';
import { RendezvousHistory, RendezvousTracker } from '../RendezvousTracker';
import { SourceLocation } from '../managers/LocationManager';
import { PROTOCOL_ERROR_CODES } from '../debugProtocol/Constants';
import { BreakpointManager } from '../managers/BreakpointManager';
import { ProjectManager } from '../managers/ProjectManager';
import { BreakpointEvent, Breakpoint } from 'vscode-debugadapter';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class DebugProtocolAdapter {
    constructor(
        private host: string,
        private stopOnEntry: boolean = false
    ) {
        this.emitter = new EventEmitter();
        this.rendezvousTracker = new RendezvousTracker();
        this.compileErrorProcessor = new CompileErrorProcessor();

        // watch for rendezvous events
        this.rendezvousTracker.on('rendezvous-event', (output) => {
            this.emit('rendezvous-event', output);
        });
    }

    public connected: boolean;

    private compileClient: Socket;
    private compileErrorProcessor: CompileErrorProcessor;
    private emitter: EventEmitter;
    private rendezvousTracker: RendezvousTracker;
    private socketDebugger: Debugger;
    private nextFrameId: number = 1;

    private stackFramesCache: { [keys: number]: StackFrame } = {};
    private cache = {};

    public get supportsMultipleRuns() {
        return false;
    }

    /**
     * Subscribe to various events
     * @param eventName
     * @param handler
     */
    public on(eventName: 'cannot-continue', handler: () => void);
    public on(eventName: 'close', handler: () => void);
    public on(eventName: 'app-exit', handler: () => void);
    public on(eventName: 'compile-errors', handler: (params: { path: string; lineNumber: number; }[]) => void);
    public on(eventName: 'connected', handler: (params: boolean) => void);
    public on(eventname: 'console-output', handler: (output: string) => void); // TODO: might be able to remove this at some point.
    public on(eventname: 'breakpoint-change', handler: (output: BreakpointEvent) => void);
    public on(eventname: 'protocol-version', handler: (output: ProtocolVersionDetails) => void);
    public on(eventname: 'rendezvous-event', handler: (output: RendezvousHistory) => void);
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
        eventName:
            'app-exit' |
            'breakpoint-change' |
            'cannot-continue' |
            'close' |
            'compile-errors' |
            'connected' |
            'console-output' |
            'protocol-version' |
            'rendezvous-event' |
            'runtime-error' |
            'start' |
            'suspend' |
            'unhandled-console-output',
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
        this.handleStartupIfReady();
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
            // Emit IO output from the debugger.
            this.socketDebugger.on('io-output', async (responseText) => {
                if (responseText) {
                    responseText = await this.rendezvousTracker.processLogLine(responseText);
                    this.emit('unhandled-console-output', responseText);
                }
            });

            // Emit IO output from the debugger.
            this.socketDebugger.on('protocol-version', (data: ProtocolVersionDetails) => {
                if (data.errorCode === PROTOCOL_ERROR_CODES.SUPPORTED) {
                    this.emit('console-output', data.message);
                } else if (data.errorCode === PROTOCOL_ERROR_CODES.NOT_TESTED) {
                    this.emit('unhandled-console-output', data.message);
                } else if (data.errorCode === PROTOCOL_ERROR_CODES.NOT_SUPPORTED) {
                    this.emit('unhandled-console-output', data.message);
                }
            });

            // Listen for the close event
            this.socketDebugger.on('close', () => {
                this.emit('close');
                this.beginAppExit();
            });

            this.connected = await this.socketDebugger.connect();

            console.log(`Closing telnet connection used for compile errors`);
            if (this.compileClient) {
                this.compileClient.removeAllListeners();
                this.compileClient.destroy();
                this.compileClient = undefined;
            }

            console.log(`+++++++++++ CONNECTED TO DEVICE ${this.host}, Success ${this.connected} +++++++++++`);
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
        return await deferred.promise;
    }

    private beginAppExit() {
        let that = this;
        this.compileErrorProcessor.compileErrorTimer = setTimeout(() => {
            that.isAppRunning = false;
            that.emit('app-exit');
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
                deferred.reject(new Error(`Error with connection to: ${this.host} \n\n ${err.message}`));
            });

            this.compileClient.connect(8085, this.host, () => {
                console.log(`+++++++++++ CONNECTED TO DEVICE ${this.host} VIA TELNET FOR COMPILE INFO +++++++++++`);
            });

            await this.settle(this.compileClient, 'data');

            let lastPartialLine = '';
            this.compileClient.on('data', (buffer) => {
                let responseText = buffer.toString();
                if (!responseText.endsWith('\n')) {
                    // buffer was split, save the partial line
                    lastPartialLine += responseText;
                } else {
                    if (lastPartialLine) {
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
        return await deferred.promise;
    }

    /**
     * Send command to step over
     */
    public async stepOver(threadId: number) {
        this.clearCache();
        return await this.socketDebugger.stepOver(threadId);
    }

    public async stepInto(threadId: number) {
        this.clearCache();
        return await this.socketDebugger.stepIn(threadId);
    }

    public async stepOut(threadId: number) {
        this.clearCache();
        return await this.socketDebugger.stepOut(threadId);
    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public async continue() {
        this.clearCache();
        return await this.socketDebugger.continue();
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public async pause() {
        this.clearCache();
        //send the kill signal, which breaks into debugger mode
        return await this.socketDebugger.pause();
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
     */
    public async evaluate(command: string, frameId: number = this.socketDebugger.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot run evaluate: debugger is not paused');
        }

        // Pipe all evaluate requests though as a variable request as evaluate is not available at the moment.
        return await this.getVariable(command, frameId);
    }

    public async getStackTrace(threadId: number = this.socketDebugger.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return await this.resolve(`stack trace for thread ${threadId}`, async () => {
            let thread = await this.getThreadByThreadId(threadId);
            let frames: StackFrame[] = [];
            let stackTraceData: any = await this.socketDebugger.stackTrace(threadId);
            for (let i = 0; i < stackTraceData.stackSize; i++) {
                let frameData = stackTraceData.entries[i];
                let frame: StackFrame = {
                    frameId: this.nextFrameId ++,
                    frameIndex: stackTraceData.stackSize - i - 1, // frame index is the reverse of the returned order.
                    threadIndex: threadId,
                    filePath: i === 0 ? (frameData.fileName) ? frameData.fileName : thread.filePath : frameData.fileName,
                    lineNumber: frameData.lineNumber,
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
    public async getVariable(expression: string, frameId: number, withChildren: boolean = true) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }

        let frame = this.getStackTraceById(frameId);
        if (!frame) {
            throw new Error('Cannot request variable without a corresponding frame');
        }

        return await this.resolve(`variable: ${expression} ${frame.frameIndex} ${frame.threadIndex}`, async () => {
            let variablePath = this.getVariablePath(expression);
            let variableInfo: any = await this.socketDebugger.getVariables(variablePath, withChildren, frame.frameIndex, frame.threadIndex);

            if (variableInfo.errorCode === 'OK') {
                let mainContainer: EvaluateContainer;
                let children: EvaluateContainer[] = [];
                let firstHandled = false;
                for (let variable of variableInfo.variables) {
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
                            // If this is a scope request there will be no entry's in the variable path
                            // We will need to create a fake mainContainer
                            firstHandled = true;
                            mainContainer = <EvaluateContainer>{
                                name: expression,
                                evaluateName: expression,
                                variablePath: variablePath,
                                type: '',
                                value: null,
                                keyType: 'String',
                                elementCount: variableInfo.numVariables
                            };
                        }

                        let pathAddition = mainContainer.keyType === 'Integer' ? children.length : variable.name;
                        container.name = pathAddition.toString();
                        container.evaluateName = `${mainContainer.evaluateName}.${pathAddition}`;
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
        });
    }

    public getVariablePath(expression: string): string[] {
        // Regex 101 link for match examples: https://regex101.com/r/KNKfHP/8
        let regexp = /(?:\[\"(.*?)\"\]|([a-z_][a-z0-9_\$%!#]*)|\[([0-9]*)\]|\.([0-9]+))/gi;
        let match: RegExpMatchArray;
        let variablePath = [];

        while (match = regexp.exec(expression)) {
            // match 1: strings between quotes - this["that"]
            // match 2: any valid brightscript viable format
            // match 3: array/list access via index - this[0]
            // match 3: array/list access via dot notation (not valid in code but returned as part of the VS Code flow) - this.0
            variablePath.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
        }
        return variablePath;
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
        return this.cache[key] = Promise.resolve<T>(factory());
    }

    /**
     * Get a list of threads. The first thread in the list is the active thread
     */
    public async getThreads() {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get threads: debugger is not paused');
        }
        return await this.resolve('threads', async () => {
            let threads: Thread[] = [];
            let threadsData: any = await this.socketDebugger.threads();

            for (let i = 0; i < threadsData.threadsCount; i ++) {
                let threadInfo = threadsData.threads[i];
                let thread = <Thread> {
                    // NOTE: On THREAD_ATTACHED events the threads request is marking the wrong thread as primary.
                    // NOTE: Rely on the thead index from the threads update event.
                    isSelected: this.socketDebugger.primaryThread === i,
                    // isSelected: threadInfo.isPrimary,
                    filePath: threadInfo.fileName,
                    functionName: threadInfo.functionName,
                    lineNumber: threadInfo.lineNumber,
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

    public async workOnBreakpoints(breakpointManager: BreakpointManager, projectManager: ProjectManager) {
        if (this.connected && this.isAtDebuggerPrompt) {
            let breakpointQueue = breakpointManager.getBreakpointQueue();

            Object.entries(breakpointQueue).forEach( async ([key, args]) => {

                if (!args.sourceModified) {
                    let cachedBreakpoints = breakpointManager.getBreakpointsForFile(args.source.path);
                    if (cachedBreakpoints) {
                        let breakpointsToRemove = cachedBreakpoints.filter(a => {
                            return !args.breakpoints.find(b => b.line === a.line);
                        });

                        if (breakpointsToRemove) {
                            let protocolBreakpointIdsToRemove = [];
                            for (let breakpoint of breakpointsToRemove) {
                                cachedBreakpoints.splice(cachedBreakpoints.indexOf(breakpoint), 1);
                                protocolBreakpointIdsToRemove = protocolBreakpointIdsToRemove.concat(breakpoint.protocolBreakpointIds);
                                this.sendBreakpointChangeEvent('removed', breakpoint);
                            }

                            await this.removeBreakpoints(protocolBreakpointIdsToRemove);
                        }
                    } else {
                        cachedBreakpoints = [];
                    }

                    for (let breakpoint of args.breakpoints) {
                        console.log(breakpoint);

                        if (!cachedBreakpoints.find(obj => obj.line === breakpoint.line)) {
                            if (!breakpoint.logMessage && !breakpoint.condition) {
                                let breakpoints = await breakpointManager.getBreakpointRequests(args.source.path, breakpoint, projectManager.mainProject, 'pkg:');

                                for (let project of projectManager.componentLibraryProjects) {
                                    breakpoints = breakpoints.concat(await breakpointManager.getBreakpointRequests(args.source.path, breakpoint, project, 'pkg:'));
                                }
                                console.log(breakpoints);
                                let result = await this.addBreakpoints(breakpoints);
                                console.log(result);

                                let protocolBreakpointIds = result.breakpoints.map((item) => item.breakpointId);

                                if (result?.breakpoints) {
                                    let bp = breakpointManager.updateBreakpoint(args.source.path, {
                                        /** If true breakpoint could be set (but not necessarily at the desired location). */
                                        verified: result.breakpoints[0].errorCode === 'OK' && result.breakpoints[0].breakpointId > 0,
                                        /** The start line of the actual range covered by the breakpoint. */
                                        line: breakpoint.line,
                                        protocolBreakpointIds: protocolBreakpointIds
                                    });
                                    console.log(bp);
                                }
                            } else {
                                let bp = breakpointManager.updateBreakpoint(args.source.path, {
                                    /** If true breakpoint could be set (but not necessarily at the desired location). */
                                    verified: false,
                                    /** The start line of the actual range covered by the breakpoint. */
                                    line: breakpoint.line,
                                });
                            }
                        }
                    }

                    breakpointManager.removeQueuedBreakpointsForFile(args.source.path);
                    let savedBreakpoints = breakpointManager.getBreakpointsForFile(args.source.path);

                    let breakpointsToUpdate = savedBreakpoints.filter(a => {
                        return args.breakpoints.find(b => b.line === a.line);
                    });

                    for (let breakpoint of breakpointsToUpdate) {
                        this.sendBreakpointChangeEvent('changed', breakpoint);
                    }
                }

            });
        }
    }

    private sendBreakpointChangeEvent(reason: 'changed' | 'new' | 'removed', breakpoint: Breakpoint) {
        this.emit('breakpoint-change', new BreakpointEvent(reason, breakpoint));
    }

    public async addBreakpoints(breakpoints: Array<AddBreakpointRequestObject> = []): Promise<any> {
        return await this.socketDebugger.addBreakpoints(breakpoints);
    }

    public async removeBreakpoints(breakpoints: RemoveBreakpointRequestObject = []): Promise<any> {
        return await this.socketDebugger.removeBreakpoints(breakpoints);
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

    /**
     * Make sure any active Brightscript Debugger threads are exited
     */
    public async exitActiveBrightscriptDebugger() {
      // Legacy function called by the debug section
    }

    // #region Rendezvous Tracker pass though functions
    /**
     * Passes the debug functions used to locate the client files and lines to the RendezvousTracker
     */
    public registerSourceLocator(sourceLocator: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>) {
        this.rendezvousTracker.registerSourceLocator(sourceLocator);
    }

    /**
     * Passes the log level down to the RendezvousTracker
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.rendezvousTracker.setConsoleOutput(outputLevel);
    }

    /**
     * Sends a call you the RendezvousTracker to clear the current rendezvous history
     */
    public clearRendezvousHistory() {
        this.rendezvousTracker.clearRendezvousHistory();
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

export enum HighLevelType {
    primative = 'primative',
    array = 'array',
    function = 'function',
    object = 'object',
    uninitialized = 'uninitialized'
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
