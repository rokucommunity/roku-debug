import type { BreakpointSpec, ConstructorOptions, ProtocolVersionDetails } from '../debugProtocol/Debugger';
import { Debugger } from '../debugProtocol/Debugger';
import * as EventEmitter from 'events';
import { Socket } from 'net';
import type { BSDebugDiagnostic } from '../CompileErrorProcessor';
import { CompileErrorProcessor } from '../CompileErrorProcessor';
import type { RendezvousHistory } from '../RendezvousTracker';
import { RendezvousTracker } from '../RendezvousTracker';
import type { ChanperfData } from '../ChanperfTracker';
import { ChanperfTracker } from '../ChanperfTracker';
import type { SourceLocation } from '../managers/LocationManager';
import { ERROR_CODES, PROTOCOL_ERROR_CODES, STOP_REASONS } from '../debugProtocol/Constants';
import { defer, util } from '../util';
import { logger } from '../logging';
import * as semver from 'semver';
import type { AdapterOptions, HighLevelType, RokuAdapterEvaluateResponse } from '../interfaces';
import type { BreakpointManager } from '../managers/BreakpointManager';
import type { ProjectManager } from '../managers/ProjectManager';
import { ActionQueue } from '../managers/ActionQueue';
import type { VerifiedBreakpointsData } from '../debugProtocol/responses/BreakpointVerifiedUpdateResponse';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class DebugProtocolAdapter {
    constructor(
        private options: AdapterOptions & ConstructorOptions,
        private projectManager: ProjectManager,
        private breakpointManager: BreakpointManager
    ) {
        util.normalizeAdapterOptions(this.options);
        this.emitter = new EventEmitter();
        this.chanperfTracker = new ChanperfTracker();
        this.rendezvousTracker = new RendezvousTracker();
        this.compileErrorProcessor = new CompileErrorProcessor();
        this.connected = false;

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

    /**
     * Indicates whether the adapter has successfully established a connection with the device
     */
    public connected: boolean;

    /**
     *  Due to casing issues with the variables request on some versions of the debug protocol, we first need to try the request in the supplied case.
     * If that fails we retry in lower case. This flag is used to drive that logic switching
     */
    private enableVariablesLowerCaseRetry = true;
    private supportsExecuteCommand: boolean;
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
    public on(eventName: 'breakpoints-verified', handler: (data: VerifiedBreakpointsData) => void);
    public on(eventName: 'cannot-continue', handler: () => void);
    public on(eventname: 'chanperf', handler: (output: ChanperfData) => void);
    public on(eventName: 'close', handler: () => void);
    public on(eventName: 'app-exit', handler: () => void);
    public on(eventName: 'diagnostics', handler: (params: BSDebugDiagnostic[]) => void);
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

    private emit(eventName: 'suspend');
    private emit(eventName: 'breakpoints-verified', data: VerifiedBreakpointsData);
    private emit(eventName: 'diagnostics', data: BSDebugDiagnostic[]);
    private emit(eventName: 'app-exit' | 'cannot-continue' | 'chanperf' | 'close' | 'connected' | 'console-output' | 'protocol-version' | 'rendezvous' | 'runtime-error' | 'start' | 'unhandled-console-output', data?);
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

    public activate() {
        this.isActivated = true;
        this.handleStartupIfReady();
    }

    public async sendErrors() {
        await this.compileErrorProcessor.sendErrors();
    }

    private handleStartupIfReady() {
        if (this.isActivated && this.isAppRunning) {
            this.emit('start');

            //if we are already sitting at a debugger prompt, we need to emit the first suspend event.
            //If not, then there are probably still messages being received, so let the normal handler
            //emit the suspend event when it's ready
            if (this.isAtDebuggerPrompt === true) {
                this.emit('suspend');
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
        return this.socketDebugger?.isStopped ?? false;
    }

    /**
     * Connect to the telnet session. This should be called before the channel is launched.
     */
    public async connect() {
        let deferred = defer();
        this.socketDebugger = new Debugger(this.options);
        try {
            // Emit IO from the debugger.
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.socketDebugger.on('io-output', async (responseText) => {
                if (typeof responseText === 'string') {
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

                // TODO: Update once we know the exact version of the debug protocol this issue was fixed in.
                // Due to casing issues with variables on protocol version <FUTURE_VERSION> and under we first need to try the request in the supplied case.
                // If that fails we retry in lower case.
                this.enableVariablesLowerCaseRetry = semver.satisfies(this.activeProtocolVersion, '<3.1.0');
                // While execute was added as a command in 2.1.0. It has shortcoming that prevented us for leveraging the command.
                // This was mostly addressed in the 3.0.0 release to the point where we were comfortable adding support for the command.
                this.supportsExecuteCommand = semver.satisfies(this.activeProtocolVersion, '>=3.0.0');
            });

            // Listen for the close event
            this.socketDebugger.on('close', () => {
                this.emit('close');
                this.beginAppExit();
            });

            // Listen for the app exit event
            this.socketDebugger.on('app-exit', () => {
                this.emit('app-exit');
            });

            this.socketDebugger.on('suspend', (data) => {
                this.clearCache();
                this.emit('suspend');
            });

            this.socketDebugger.on('runtime-error', (data) => {
                console.debug('hasRuntimeError!!', data);
                this.emit('runtime-error', <BrightScriptRuntimeError>{
                    message: data.data.stopReasonDetail,
                    errorCode: STOP_REASONS[data.data.stopReason]
                });
            });

            this.socketDebugger.on('cannot-continue', () => {
                this.emit('cannot-continue');
            });

            //handle when the device verifies breakpoints
            this.socketDebugger.on('breakpoints-verified', (event) => {
                //mark the breakpoints as verified
                for (let breakpoint of event?.breakpoints ?? []) {
                    this.breakpointManager.verifyBreakpoint(breakpoint.breakpointId, true);
                }
                this.emit('breakpoints-verified', event);
            });

            this.connected = await this.socketDebugger.connect();

            this.logger.log(`Closing telnet connection used for compile errors`);
            if (this.compileClient) {
                this.compileClient.removeAllListeners();
                this.compileClient.destroy();
                this.compileClient = undefined;
            }

            this.logger.log(`Connected to device`, { host: this.options.host, connected: this.connected });
            this.emit('connected', this.connected);

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
            this.compileErrorProcessor.on('diagnostics', (errors) => {
                this.compileClient.end();
                this.emit('diagnostics', errors);
            });

            //if the connection fails, reject the connect promise
            this.compileClient.addListener('error', (err) => {
                deferred.reject(new Error(`Error with connection to: ${this.options.host}:${this.options.brightScriptConsolePort} \n\n ${err.message} `));
            });
            this.logger.info('Connecting via telnet to gather compile info', { host: this.options.host, port: this.options.brightScriptConsolePort });
            this.compileClient.connect(this.options.brightScriptConsolePort, this.options.host, () => {
                this.logger.log(`Connected via telnet to gather compile info`, { host: this.options.host, port: this.options.brightScriptConsolePort });
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
    public async evaluate(command: string, frameId: number = this.socketDebugger.primaryThread): Promise<RokuAdapterEvaluateResponse> {
        if (this.supportsExecuteCommand) {
            if (!this.isAtDebuggerPrompt) {
                throw new Error('Cannot run evaluate: debugger is not paused');
            }

            let stackFrame = this.getStackFrameById(frameId);
            if (!stackFrame) {
                throw new Error('Cannot execute command without a corresponding frame');
            }
            this.logger.log('evaluate ', { command, frameId });

            const response = await this.socketDebugger.executeCommand(command, stackFrame.frameIndex, stackFrame.threadIndex);
            this.logger.info('evaluate response', { command, response });
            if (response.executeSuccess) {
                return {
                    message: undefined,
                    type: 'message'
                };
            } else {
                return {
                    message: response.compileErrors.messages[0] ?? response.runtimeErrors.messages[0] ?? response.otherErrors.messages[0] ?? 'Unknown error executing command',
                    type: 'error'
                };
            }
        } else {
            return {
                message: `Execute commands are not supported on debug protocol: ${this.activeProtocolVersion}, v3.0.0 or greater is required.`,
                type: 'error'
            };
        }
    }

    public async getStackTrace(threadId: number = this.socketDebugger.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return this.resolve(`stack trace for thread ${threadId}`, async () => {
            let thread = await this.getThreadByThreadId(threadId);
            let frames: StackFrame[] = [];
            let stackTraceData = await this.socketDebugger.stackTrace(threadId);
            for (let i = 0; i < stackTraceData.stackSize; i++) {
                let frameData = stackTraceData.entries[i];
                let stackFrame: StackFrame = {
                    frameId: this.nextFrameId++,
                    // frame index is the reverse of the returned order.
                    frameIndex: stackTraceData.stackSize - i - 1,
                    threadIndex: threadId,
                    filePath: frameData.fileName,
                    lineNumber: frameData.lineNumber,
                    // eslint-disable-next-line no-nested-ternary
                    functionIdentifier: this.cleanUpFunctionName(i === 0 ? (frameData.functionName) ? frameData.functionName : thread.functionName : frameData.functionName)
                };
                this.stackFramesCache[stackFrame.frameId] = stackFrame;
                frames.push(stackFrame);
            }
            //if the first frame is missing any data, suppliment with thread information
            if (frames[0]) {
                frames[0].filePath ??= thread.filePath;
                frames[0].lineNumber ??= thread.lineNumber;
            }

            return frames;
        });
    }

    private getStackFrameById(frameId: number): StackFrame {
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

        let frame = this.getStackFrameById(frameId);
        if (!frame) {
            throw new Error('Cannot request variable without a corresponding frame');
        }

        logger.log(`Expression:`, expression);
        let variablePath = expression === '' ? [] : util.getVariablePath(expression);

        // Temporary workaround related to casing issues over the protocol
        if (this.enableVariablesLowerCaseRetry && variablePath?.length > 0) {
            variablePath[0] = variablePath[0].toLowerCase();
        }

        let response = await this.socketDebugger.getVariables(variablePath, withChildren, frame.frameIndex, frame.threadIndex);

        if (this.enableVariablesLowerCaseRetry && response.errorCode !== ERROR_CODES.OK) {
            // Temporary workaround related to casing issues over the protocol
            logger.log(`Retrying expression as lower case:`, expression);
            variablePath = expression === '' ? [] : util.getVariablePath(expression?.toLowerCase());
            response = await this.socketDebugger.getVariables(variablePath, withChildren, frame.frameIndex, frame.threadIndex);
        }


        if (response.errorCode === ERROR_CODES.OK) {
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
                    //subtyped objects can only have string values
                    let parts = (variable.value as string).split('; ');
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
                        container.evaluateName = `${mainContainer.evaluateName}["${pathAddition}"]`;
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
            this.logger.log('return cashed response', key, this.cache[key]);
            return this.cache[key];
        }
        this.cache[key] = Promise.resolve<T>(factory());
        return this.cache[key];
    }

    /**
     * Get a list of threads. The active thread will always be first in the list.
     */
    public async getThreads() {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get threads: debugger is not paused');
        }
        return this.resolve('threads', async () => {
            let threads: Thread[] = [];
            let threadsData = await this.socketDebugger.threads();

            for (let i = 0; i < threadsData.threadsCount; i++) {
                let threadInfo = threadsData.threads[i];
                let thread = <Thread>{
                    // NOTE: On THREAD_ATTACHED events the threads request is marking the wrong thread as primary.
                    // NOTE: Rely on the thead index from the threads update event.
                    isSelected: this.socketDebugger.primaryThread === i,
                    // isSelected: threadInfo.isPrimary,
                    filePath: threadInfo.fileName,
                    functionName: threadInfo.functionName,
                    lineNumber: threadInfo.lineNumber + 1, //protocol is 1-based
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

    public removeAllListeners() {
        this.emitter?.removeAllListeners();
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

    public async syncBreakpoints() {
        //we can't send breakpoints unless we're stopped (or in a protocol version that supports sending them while running).
        //So...if we're not stopped, quit now. (we'll get called again when the stop event happens)
        if (!this.socketDebugger.supportsBreakpointRegistrationWhileRunning && !this.isAtDebuggerPrompt) {
            return;
        }

        //compute breakpoint changes since last sync
        const diff = await this.breakpointManager.getDiff(this.projectManager.getAllProjects());

        //delete these breakpoints
        if (diff.removed.length > 0) {
            await this.actionQueue.run(async () => {
                const response = await this.socketDebugger.removeBreakpoints(
                    diff.removed.map(x => x.deviceId)
                );
                //return true to mark this action as complete, or false to retry the task again in the future
                return response.success && response.errorCode === ERROR_CODES.OK;
            });
        }

        if (diff.added.length > 0) {
            const breakpointsToSendToDevice = diff.added.map(breakpoint => {
                const hitCount = parseInt(breakpoint.hitCondition);
                return {
                    filePath: breakpoint.pkgPath,
                    lineNumber: breakpoint.line,
                    hitCount: !isNaN(hitCount) ? hitCount : undefined,
                    conditionalExpression: breakpoint.condition,
                    key: breakpoint.hash,
                    componentLibraryName: breakpoint.componentLibraryName
                };
            });

            //send these new breakpoints to the device
            await this.actionQueue.run(async () => {
                //split the list into conditional and non-conditional breakpoints.
                //(TODO we can eliminate this splitting logic once the conditional breakpoints "continue" bug in protocol is fixed)
                const standardBreakpoints: typeof breakpointsToSendToDevice = [];
                const conditionalBreakpoints: typeof breakpointsToSendToDevice = [];
                for (const breakpoint of breakpointsToSendToDevice) {
                    if (breakpoint?.conditionalExpression?.trim()) {
                        conditionalBreakpoints.push(breakpoint);
                    } else {
                        standardBreakpoints.push(breakpoint);
                    }
                }
                let success = true;
                for (const breakpoints of [standardBreakpoints, conditionalBreakpoints]) {
                    const response = await this.socketDebugger.addBreakpoints(breakpoints);
                    if (response.errorCode === ERROR_CODES.OK) {
                        //mark the breakpoints as verified
                        for (let i = 0; i < response.breakpoints.length; i++) {
                            const deviceBreakpoint = response.breakpoints[i];
                            //sync this breakpoint's deviceId with the roku-assigned breakpoint ID
                            this.breakpointManager.setBreakpointDeviceId(
                                breakpoints[i].key,
                                deviceBreakpoint.breakpointId
                            );
                        }
                        //return true to mark this action as complete
                        success &&= true;
                    } else {
                        //this action is not yet complete. it should be retried
                        success &&= false;
                    }
                }
                return success;
            });
        }
    }

    private actionQueue = new ActionQueue();
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
