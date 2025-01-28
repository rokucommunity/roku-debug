import * as EventEmitter from 'events';
import { Socket } from 'net';
import { DiagnosticSeverity, util as bscUtil } from 'brighterscript';
import type { BSDebugDiagnostic } from '../CompileErrorProcessor';
import { CompileErrorProcessor } from '../CompileErrorProcessor';
import type { RendezvousHistory, RendezvousTracker } from '../RendezvousTracker';
import type { ChanperfData } from '../ChanperfTracker';
import { ChanperfTracker } from '../ChanperfTracker';
import { ErrorCode, PROTOCOL_ERROR_CODES, UpdateType } from '../debugProtocol/Constants';
import { defer, util } from '../util';
import { logger } from '../logging';
import * as semver from 'semver';
import type { AdapterOptions, HighLevelType, RokuAdapterEvaluateResponse } from '../interfaces';
import type { BreakpointManager } from '../managers/BreakpointManager';
import type { ProjectManager } from '../managers/ProjectManager';
import type { BreakpointsVerifiedEvent, ConstructorOptions, ProtocolVersionDetails } from '../debugProtocol/client/DebugProtocolClient';
import { DebugProtocolClient } from '../debugProtocol/client/DebugProtocolClient';
import type { Variable } from '../debugProtocol/events/responses/VariablesResponse';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import type { TelnetAdapter } from './TelnetAdapter';
import type { DeviceInfo } from 'roku-deploy';
import type { ThreadsResponse } from '../debugProtocol/events/responses/ThreadsResponse';
import type { ExceptionBreakpoint } from '../debugProtocol/events/requests/SetExceptionBreakpointsRequest';
import { insertCustomVariables, overrideKeyTypesForCustomVariables } from './customVariableUtils';

/**
 * A class that connects to a Roku device over telnet debugger port and provides a standardized way of interacting with it.
 */
export class DebugProtocolAdapter {
    constructor(
        private options: AdapterOptions & ConstructorOptions,
        private projectManager: ProjectManager,
        private breakpointManager: BreakpointManager,
        private rendezvousTracker: RendezvousTracker,
        private deviceInfo: DeviceInfo
    ) {
        util.normalizeAdapterOptions(this.options);
        this.emitter = new EventEmitter();
        this.chanperfTracker = new ChanperfTracker();
        this.compileErrorProcessor = new CompileErrorProcessor();
        this.connected = false;

        // watch for chanperf events
        this.chanperfTracker.on('chanperf', (output) => {
            this.emit('chanperf', output);
        });
    }

    private logger = logger.createLogger(`[padapter]`);

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
    private client: DebugProtocolClient;
    private nextFrameId = 1;

    private stackFramesCache: Record<number, StackFrame> = {};
    private cache = {};

    /**
     * Get the version of the protocol for the Roku device we're currently connected to.
     */
    public get activeProtocolVersion() {
        return this.client?.protocolVersion;
    }

    /**
     * Subscribe to an event exactly once
     * @param eventName
     */
    public once(eventName: 'cannot-continue'): Promise<void>;
    public once(eventname: 'chanperf'): Promise<ChanperfData>;
    public once(eventName: 'close'): Promise<void>;
    public once(eventName: 'app-exit'): Promise<void>;
    public once(eventName: 'app-ready'): Promise<void>;
    public once(eventName: 'diagnostics'): Promise<BSDebugDiagnostic>;
    public once(eventName: 'connected'): Promise<boolean>;
    public once(eventname: 'console-output'): Promise<string>; // TODO: might be able to remove this at some point
    public once(eventname: 'protocol-version'): Promise<ProtocolVersionDetails>;
    public once(eventname: 'rendezvous'): Promise<RendezvousHistory>;
    public once(eventName: 'runtime-error'): Promise<BrightScriptRuntimeError>;
    public once(eventName: 'suspend'): Promise<void>;
    public once(eventName: 'start'): Promise<void>;
    public once(eventname: 'unhandled-console-output'): Promise<string>;
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
    public on(eventName: 'breakpoints-verified', handler: (event: BreakpointsVerifiedEvent) => void);
    public on(eventName: 'cannot-continue', handler: () => void);
    public on(eventname: 'chanperf', handler: (output: ChanperfData) => void);
    public on(eventName: 'close', handler: () => void);
    public on(eventName: 'app-exit', handler: () => void);
    public on(eventName: 'diagnostics', handler: (params: BSDebugDiagnostic[]) => void);
    public on(eventName: 'connected', handler: (params: boolean) => void);
    public on(eventname: 'console-output', handler: (output: string) => void); // TODO: might be able to remove this at some point.
    public on(eventname: 'protocol-version', handler: (output: ProtocolVersionDetails) => void);
    public on(eventName: 'runtime-error', handler: (error: BrightScriptRuntimeError) => void);
    public on(eventName: 'suspend', handler: () => void);
    public on(eventName: 'start', handler: () => void);
    public on(eventName: 'waiting-for-debugger', handler: () => void);
    public on(eventname: 'unhandled-console-output', handler: (output: string) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter?.on(eventName, handler);
        return () => {
            this.emitter?.removeListener(eventName, handler);
        };
    }

    private emit(eventName: 'suspend');
    private emit(eventName: 'breakpoints-verified', event: BreakpointsVerifiedEvent);
    private emit(eventName: 'diagnostics', data: BSDebugDiagnostic[]);
    private emit(eventName: 'app-exit' | 'app-ready' | 'cannot-continue' | 'chanperf' | 'close' | 'connected' | 'console-output' | 'protocol-version' | 'rendezvous' | 'runtime-error' | 'start' | 'unhandled-console-output' | 'waiting-for-debugger', data?);
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
     * Does the current client support exception breakpoints? This value will be undefined if the client has not yet connected
     */
    public get supportsExceptionBreakpoints(): boolean | undefined {
        return this.client?.supportsExceptionBreakpoints;
    }

    public get currentThreadId(): number {
        return this.client?.primaryThread;
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
        return this.client?.isStopped ?? false;
    }

    private firstConnectDeferred = defer<void>();

    /**
     * Resolves when the first connection to the client is established
     */
    public onReady() {
        return this.firstConnectDeferred.promise;
    }

    /**
     * Connect to the telnet session. This should be called before the channel is launched.
     */
    public async connect(): Promise<void> {
        //Start processing telnet output to look for compile errors or the debugger prompt
        await this.processTelnetOutput();

        this.on('waiting-for-debugger', async () => { // eslint-disable-line @typescript-eslint/no-misused-promises
            await this.createDebugProtocolClient();

            //if this is the first time we are connecting, resolve the promise.
            //(future events fire for "reconnect" situations, we don't need to resolve again for those)
            if (!this.firstConnectDeferred.isCompleted) {
                this.firstConnectDeferred.resolve();
            }
        });
    }

    public async createDebugProtocolClient() {
        let deferred = defer();
        if (this.client) {
            await Promise.race([
                util.sleep(2000),
                await this.client.destroy()
            ]);
            this.client = undefined;
        }
        this.client = new DebugProtocolClient(this.options);
        try {
            // Emit IO from the debugger.
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.client.on('io-output', async (responseText) => {
                if (typeof responseText === 'string') {
                    responseText = this.chanperfTracker.processLog(responseText);
                    responseText = await this.rendezvousTracker.processLog(responseText);
                    this.emit('unhandled-console-output', responseText);
                    this.emit('console-output', responseText);
                }
            });

            // Emit IO from the debugger.
            this.client.on('protocol-version', (data: ProtocolVersionDetails) => {
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
            this.client.on('close', () => {
                this.emit('close');
                this.beginAppExit();
                void this.client?.destroy();
                this.client = undefined;
            });

            // Listen for the app exit event
            this.client.on('app-exit', () => {
                this.emit('app-exit');
                void this.client?.destroy();
                this.client = undefined;
            });

            this.client.on('suspend', (data) => {
                this.clearCache();
                this.emit('suspend');
            });

            this.client.on('runtime-error', (data) => {
                console.debug('hasRuntimeError!!', data);
                this.emit('runtime-error', <BrightScriptRuntimeError>{
                    message: data.data.stopReasonDetail,
                    errorCode: data.data.stopReason
                });
            });

            this.client.on('cannot-continue', () => {
                this.emit('cannot-continue');
            });

            //handle when the device verifies breakpoints
            this.client.on('breakpoints-verified', (event) => {
                let unverifiableDeviceIds = [] as number[];

                //mark the breakpoints as verified
                for (let breakpoint of event?.breakpoints ?? []) {
                    const success = this.breakpointManager.verifyBreakpoint(breakpoint.id, true);
                    if (!success) {
                        unverifiableDeviceIds.push(breakpoint.id);
                    }
                }
                //if there were any unsuccessful breakpoint verifications, we need to ask the device to delete those breakpoints as they've gone missing on our side
                if (unverifiableDeviceIds.length > 0) {
                    this.logger.warn('Could not find breakpoints to verify. Removing from device:', { deviceBreakpointIds: unverifiableDeviceIds });
                    void this.client.removeBreakpoints(unverifiableDeviceIds);
                }
                this.emit('breakpoints-verified', event);
            });

            this.client.on('compile-error', (update) => {
                let diagnostics: BSDebugDiagnostic[] = [];
                diagnostics.push({
                    path: update.data.filePath,
                    range: bscUtil.createRange(update.data.lineNumber - 1, 0, update.data.lineNumber - 1, 999),
                    message: update.data.errorMessage,
                    severity: DiagnosticSeverity.Error,
                    code: undefined
                });
                this.emit('diagnostics', diagnostics);
            });

            await this.client.connect();

            this.logger.log(`Connected to device`, { host: this.options.host, connected: this.connected });
            this.connected = true;
            this.emit('connected', this.connected);
            this.emit('app-ready');

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

    /**
     * Determines if the current version of the debug protocol supports emitting compile error updates.
     */
    public get supportsCompileErrorReporting() {
        return semver.satisfies(this.deviceInfo.brightscriptDebuggerVersion, '>=3.1.0');
    }

    private processingTelnetOutput = false;
    public async processTelnetOutput() {
        if (this.processingTelnetOutput) {
            return;
        }
        this.processingTelnetOutput = true;

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
                this.logger.log(`CONNECTED via telnet to gather compile info`, { host: this.options.host, port: this.options.brightScriptConsolePort });
            });

            this.logger.debug('Waiting for the compile client to settle');
            await this.settle(this.compileClient, 'data');
            this.logger.debug('Compile client has settled');

            let lastPartialLine = '';
            this.compileClient.on('data', (buffer) => {
                let responseText = buffer.toString();
                this.logger.info('CompileClient received data', { responseText });

                let logResult = util.handleLogFragments(lastPartialLine, buffer.toString());

                // Save any remaining partial line for the next event
                lastPartialLine = logResult.remaining;
                if (logResult.completed) {
                    // Emit the completed io string.
                    this.findWaitForDebuggerPrompt(logResult.completed);
                    this.compileErrorProcessor.processUnhandledLines(logResult.completed);
                    this.emit('unhandled-console-output', logResult.completed);
                } else {
                    this.logger.debug('Buffer was split', lastPartialLine);
                }
            });

            // connected to telnet. resolve the promise
            deferred.resolve();
        } catch (e) {
            deferred.reject(e);
        }
        return deferred.promise;
    }

    private findWaitForDebuggerPrompt(responseText: string) {
        let lines = responseText.split(/\r?\n/g);
        for (const line of lines) {
            if (/Waiting for debugger on \d+\.\d+\.\d+\.\d+:8081/g.exec(line)) {
                this.emit('waiting-for-debugger');
            }
        }
    }

    /**
     * Send command to step over
     */
    public async stepOver(threadId: number) {
        this.clearCache();
        return this.client.stepOver(threadId);
    }

    public async stepInto(threadId: number) {
        this.clearCache();
        return this.client.stepIn(threadId);
    }

    public async stepOut(threadId: number) {
        this.clearCache();
        return this.client.stepOut(threadId);
    }

    /**
     * Tell the brightscript program to continue (i.e. resume program)
     */
    public async continue() {
        this.clearCache();
        return this.client.continue();
    }

    /**
     * Tell the brightscript program to pause (fall into debug mode)
     */
    public async pause() {
        this.clearCache();
        //send the kill signal, which breaks into debugger mode
        return this.client.pause();
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
    public async evaluate(command: string, frameId: number = this.client.primaryThread): Promise<RokuAdapterEvaluateResponse> {
        if (this.supportsExecuteCommand) {
            if (!this.isAtDebuggerPrompt) {
                throw new Error('Cannot run evaluate: debugger is not paused');
            }

            let stackFrame = this.getStackFrameById(frameId);
            if (!stackFrame) {
                throw new Error('Cannot execute command without a corresponding frame');
            }
            this.logger.log('evaluate ', { command, frameId });

            const response = await this.client.executeCommand(command, stackFrame.frameIndex, stackFrame.threadIndex);
            this.logger.info('evaluate response', { command, response });
            if (response.data.executeSuccess) {
                return {
                    message: undefined,
                    type: 'message'
                };
            } else {
                const messages = [
                    ...response?.data?.compileErrors ?? [],
                    ...response?.data?.runtimeErrors ?? [],
                    ...response?.data?.otherErrors ?? []
                ];
                return {
                    message: messages[0] ?? 'Unknown error executing command',
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

    public async getStackTrace(threadIndex: number = this.client.primaryThread) {
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot get stack trace: debugger is not paused');
        }
        return this.resolve(`stack trace for thread ${threadIndex}`, async () => {
            let thread = await this.getThreadByThreadId(threadIndex);
            let frames: StackFrame[] = [];
            let stackTraceData = await this.client.getStackTrace(threadIndex);
            for (let i = 0; i < (stackTraceData?.data?.entries?.length ?? 0); i++) {
                let frameData = stackTraceData.data.entries[i];
                let stackFrame: StackFrame = {
                    frameId: this.nextFrameId++,
                    // frame index is the reverse of the returned order.
                    frameIndex: stackTraceData.data.entries.length - i - 1,
                    threadIndex: threadIndex,
                    filePath: frameData.filePath,
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
     * Get info about the specified variable.
     * @param expression the expression for the specified variable (i.e. `m`, `someVar.value`, `arr[1][2].three`). If empty string/undefined is specified, all local variables are retrieved instead
     */
    private async getVariablesResponse(expression: string, frameId: number) {
        const isScopesRequest = expression === '';
        const logger = this.logger.createLogger('[getVariable]');
        logger.info('begin', { expression });
        if (!this.isAtDebuggerPrompt) {
            throw new Error('Cannot resolve variable: debugger is not paused');
        }

        let frame = this.getStackFrameById(frameId);
        if (!frame) {
            throw new Error('Cannot request variable without a corresponding frame');
        }

        logger.info(`Expression:`, JSON.stringify(expression));
        let variablePath = expression === '' ? [] : util.getVariablePath(expression);

        // Temporary workaround related to casing issues over the protocol
        if (this.enableVariablesLowerCaseRetry && variablePath?.length > 0) {
            variablePath[0] = variablePath[0].toLowerCase();
        }

        let response = await this.client.getVariables(variablePath, frame.frameIndex, frame.threadIndex);

        if (this.enableVariablesLowerCaseRetry && response.data.errorCode !== ErrorCode.OK) {
            // Temporary workaround related to casing issues over the protocol
            logger.log(`Retrying expression as lower case:`, expression);
            variablePath = expression === '' ? [] : util.getVariablePath(expression?.toLowerCase());
            response = await this.client.getVariables(variablePath, frame.frameIndex, frame.threadIndex);
        }
        return response;
    }

    /**
     * Get the variable for the specified expression.
     */
    public async getVariable(expression: string, frameId: number) {
        const response = await this.getVariablesResponse(expression, frameId);

        if (Array.isArray(response?.data?.variables)) {
            const container = this.createEvaluateContainer(
                response.data.variables[0],
                //the name of the top container is the expression itself
                expression,
                //this is the top-level container, so there are no parent keys to this entry
                undefined
            );
            await insertCustomVariables(this, expression, container);
            return container;
        }
    }

    /**
     * Get the list of local variables
     */
    public async getLocalVariables(frameId: number) {
        const response = await this.getVariablesResponse('', frameId);

        if (response?.data?.errorCode === ErrorCode.OK && Array.isArray(response?.data?.variables)) {
            //create a top-level container to hold all the local vars
            const container = this.createEvaluateContainer(
                //dummy data
                {
                    isConst: false,
                    isContainer: true,
                    keyType: VariableType.String,
                    refCount: undefined,
                    type: VariableType.AssociativeArray,
                    value: undefined,
                    children: response.data.variables
                },
                //no name, this is a dummy container
                undefined,
                //there's no parent path
                undefined
            );
            return container;
        }
    }

    /**
     * Create an EvaluateContainer for the given variable. If the variable has children, those are created and attached as well
     * @param variable a Variable object from the debug protocol debugger
     * @param name the name of this variable. For example, `alpha.beta.charlie`, this value would be `charlie`. For local vars, this is the root variable name (i.e. `alpha`)
     * @param parentEvaluateName the string used to derive the parent, _excluding_ this variable's name (i.e. `alpha.beta` or `alpha[0]`)
     */
    private createEvaluateContainer(variable: Variable, name: string | number, parentEvaluateName: string) {
        let value;
        let variableType = variable.type;
        if (variable.value === null) {
            value = 'roInvalid';
        } else if (variableType === VariableType.String) {
            value = `\"${variable.value}\"`;
        } else {
            value = variable.value;
        }

        if (variableType === VariableType.SubtypedObject) {
            //subtyped objects can only have string values
            let parts = (variable.value as string).split('; ');
            (variableType as string) = parts[0];
        } else if (variableType === VariableType.Object || variableType === VariableType.Interface) {
            // We want the type to reflect `roAppInfo` or `roDeviceInfo` for example in the UI
            // so set the type to be the value from the device
            variableType = value;
        } else if (variableType === VariableType.AssociativeArray) {
            // We want the type to reflect `function` in the UI
            value = VariableType.AssociativeArray;
        }

        //build full evaluate name for this var. (i.e. `alpha["beta"]` + ["charlie"]` === `alpha["beta"]["charlie"]`)
        let evaluateName: string;
        if (!parentEvaluateName?.trim()) {
            evaluateName = name?.toString();
        } else if (variable.isVirtual) {
            evaluateName = `${parentEvaluateName}.${name}`;
        } else if (typeof name === 'string') {
            evaluateName = `${parentEvaluateName}["${name}"]`;
        } else if (typeof name === 'number') {
            evaluateName = `${parentEvaluateName}[${name}]`;
        }

        let container: EvaluateContainer = {
            name: name?.toString() ?? '',
            evaluateName: evaluateName ?? '',
            type: variableType ?? '',
            value: value ?? null,
            highLevelType: undefined,
            //non object/array variables don't have a key type
            keyType: variable.keyType as unknown as KeyType,
            elementCount: variable.childCount ?? variable.children?.length ?? undefined,
            //non object/array variables still need to have an empty `children` array to help upstream logic. The `keyType` being null is how we know it doesn't actually have children
            children: []
        };

        // In preparation for adding custom variables some variables need to be marked
        // as keyable/container like even thought they are not on device.
        overrideKeyTypesForCustomVariables(this, container);

        //recursively generate children containers
        if ([KeyType.integer, KeyType.string].includes(container.keyType) && Array.isArray(variable.children)) {
            container.children = [];
            for (let i = 0; i < variable.children.length; i++) {
                const childVariable = variable.children[i];
                const childContainer = this.createEvaluateContainer(
                    childVariable,
                    container.keyType === KeyType.integer ? i : childVariable.name,
                    container.evaluateName
                );
                container.children.push(childContainer);
            }
        }

        //show virtual variables in the UI
        if (variable.isVirtual) {
            container.presentationHint = 'virtual';
        }

        return container;
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
            let threadsResponse: ThreadsResponse;
            // sometimes roku threads are stubborn and haven't stopped yet, causing our ThreadsRequest to fail with "not stopped".
            // A nice simple fix for this is to just send a "pause" request again, which seems to fix the issue.
            // we'll do this a few times just to make sure we've tried our best to get the list of threads.
            for (let i = 0; i < 3; i++) {
                threadsResponse = await this.client.threads();
                if (threadsResponse.data.errorCode === ErrorCode.NOT_STOPPED) {
                    this.logger.log(`Threads request retrying... ${i}:\n`, threadsResponse);
                    threadsResponse = undefined;
                    const pauseResponse = await this.client.pause(true);
                    await util.sleep(100);
                } else {
                    break;
                }
            }
            if (!threadsResponse) {
                return [];
            }

            for (let i = 0; i < (threadsResponse.data?.threads?.length ?? 0); i++) {
                let threadInfo = threadsResponse.data.threads[i];
                let thread = <Thread>{
                    // NOTE: On THREAD_ATTACHED events the threads request is marking the wrong thread as primary.
                    // NOTE: Rely on the thead index from the threads update event.
                    isSelected: this.client.primaryThread === i,
                    // isSelected: threadInfo.isPrimary,
                    filePath: threadInfo.filePath,
                    functionName: threadInfo.functionName,
                    lineNumber: threadInfo.lineNumber, //threadInfo.lineNumber is 1-based. Thread requires 1-based line numbers
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
        if (this.emitter) {
            this.emitter.removeAllListeners();
        }
    }

    /**
     * Indicates whether this class had `.destroy()` called at least once. Mostly used for checking externally to see if
     * the whole debug session has been terminated or is in a bad state.
     */
    public isDestroyed = false;
    /**
     * Disconnect from the telnet session and unset all objects
     */
    public async destroy() {
        this.isDestroyed = true;

        // destroy the debug client if it's defined
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (e) {
                this.logger.error(e);
            }
        }

        this.cache = undefined;
        this.removeAllListeners();
        this.emitter = undefined;

        if (this.compileClient) {
            this.compileClient.removeAllListeners();
            this.compileClient.destroy();
            this.compileClient = undefined;
        }
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
        if (this.client?.supportsExceptionBreakpoints) {
            //tell the client to set the exception breakpoints
            const response = await this.client?.setExceptionBreakpoints(filters);
            return response;
        }
        return undefined;
    }

    private syncBreakpointsPromise = Promise.resolve();
    public async syncBreakpoints() {
        this.logger.log('syncBreakpoints()');
        //wait for the previous sync to finish
        this.syncBreakpointsPromise = this.syncBreakpointsPromise
            //ignore any errors
            .catch(() => { })
            //run the next sync
            .then(() => this._syncBreakpoints());

        //return the new promise, which will resolve once our latest `syncBreakpoints()` call is finished
        return this.syncBreakpointsPromise;
    }

    public async _syncBreakpoints() {
        //we can't send breakpoints unless we're stopped (or in a protocol version that supports sending them while running).
        //So...if we're not stopped, quit now. (we'll get called again when the stop event happens)
        if (!this.client?.supportsBreakpointRegistrationWhileRunning && !this.isAtDebuggerPrompt) {
            this.logger.info('Cannot sync breakpoints because the debugger', this.client.supportsBreakpointRegistrationWhileRunning ? 'does not support sending breakpoints while running' : 'is not paused');
            return;
        }

        //compute breakpoint changes since last sync
        const diff = await this.breakpointManager.getDiff(this.projectManager.getAllProjects());
        this.logger.log('Syncing breakpoints', diff);

        if (diff.added.length === 0 && diff.removed.length === 0) {
            this.logger.debug('No breakpoints to sync');
            return;
        }

        // REMOVE breakpoints (delete these breakpoints from the device)
        if (diff.removed.length > 0) {
            const response = await this.client.removeBreakpoints(
                //TODO handle retrying to remove breakpoints that don't have deviceIds yet but might get one in the future
                diff.removed.map(x => x.deviceId).filter(x => typeof x === 'number')
            );

            if (response.data?.errorCode === ErrorCode.NOT_STOPPED) {
                this.breakpointManager.failedDeletions.push(...diff.removed);
            }
        }

        if (diff.added.length > 0) {
            const breakpointsToSendToDevice = diff.added.map(breakpoint => {
                const hitCount = parseInt(breakpoint.hitCondition);
                return {
                    filePath: breakpoint.pkgPath,
                    lineNumber: breakpoint.line,
                    hitCount: !isNaN(hitCount) ? hitCount : undefined,
                    conditionalExpression: breakpoint.condition,
                    srcHash: breakpoint.srcHash,
                    destHash: breakpoint.destHash,
                    componentLibraryName: breakpoint.componentLibraryName
                };
            });

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
            for (const breakpoints of [standardBreakpoints, conditionalBreakpoints]) {
                const response = await this.client.addBreakpoints(breakpoints);

                //if the response was successful, and we have the correct number of breakpoints in the response
                if (response.data.errorCode === ErrorCode.OK && response?.data?.breakpoints?.length === breakpoints.length) {
                    for (let i = 0; i < (response?.data?.breakpoints?.length ?? 0); i++) {
                        const deviceBreakpoint = response.data.breakpoints[i];

                        if (typeof deviceBreakpoint?.id === 'number') {
                            //sync this breakpoint's deviceId with the roku-assigned breakpoint ID
                            this.breakpointManager.setBreakpointDeviceId(
                                breakpoints[i].srcHash,
                                breakpoints[i].destHash,
                                deviceBreakpoint.id
                            );
                        }

                        //this breakpoint had an issue. remove it from the client
                        if (deviceBreakpoint.errorCode !== ErrorCode.OK) {
                            this.breakpointManager.deleteBreakpoint(breakpoints[i].srcHash);
                        }
                    }
                    //the entire response was bad. delete these breakpoints from the client
                } else {
                    this.breakpointManager.deleteBreakpoints(
                        breakpoints.map(x => x.srcHash)
                    );
                }
            }
        }
    }
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
    type: string;
    value?: any;
    keyType?: KeyType;
    elementCount?: number;
    highLevelType?: HighLevelType;
    children: EvaluateContainer[];
    isCustom?: boolean;
    lazy?: boolean;
    presentationHint?: 'property' | 'method' | 'class' | 'data' | 'event' | 'baseClass' | 'innerClass' | 'interface' | 'mostDerivedClass' | 'virtual' | 'dataBreakpoint';
}

export enum KeyType {
    string = 'String',
    integer = 'Integer',
    legacy = 'Legacy'
}

export interface Thread {
    isSelected: boolean;
    /**
     * The 1-based line number for the thread
     */
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

export function isDebugProtocolAdapter(adapter: TelnetAdapter | DebugProtocolAdapter): adapter is DebugProtocolAdapter {
    return adapter?.constructor.name === DebugProtocolAdapter.name;
}
