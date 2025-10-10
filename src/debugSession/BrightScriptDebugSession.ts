import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import * as path from 'path';
import { rokuDeploy, CompileError, isUpdateCheckRequiredError, isConnectionResetError } from 'roku-deploy';
import type { DeviceInfo, RokuDeploy, RokuDeployOptions } from 'roku-deploy';
import {
    BreakpointEvent,
    DebugSession as BaseDebugSession,
    InitializedEvent,
    InvalidatedEvent,
    OutputEvent,
    Source,
    StackFrame,
    StoppedEvent,
    TerminatedEvent,
    Thread,
    Variable
} from '@vscode/debugadapter';
import type { SceneGraphCommandResponse } from '../SceneGraphDebugCommandController';
import { SceneGraphDebugCommandController } from '../SceneGraphDebugCommandController';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { defer, util } from '../util';
import { fileUtils, standardizePath as s } from '../FileUtils';
import { ComponentLibraryServer } from '../ComponentLibraryServer';
import { ProjectManager, Project, ComponentLibraryProject, ComponentLibraryDCLProject, ComponentLibraryProjectWithCustomCMDToRun } from '../managers/ProjectManager';
import type { EvaluateContainer } from '../adapters/DebugProtocolAdapter';
import { DebugProtocolAdapter } from '../adapters/DebugProtocolAdapter';
import { TelnetAdapter } from '../adapters/TelnetAdapter';
import type { BSDebugDiagnostic } from '../CompileErrorProcessor';
import { RendezvousTracker } from '../RendezvousTracker';
import {
    LaunchStartEvent,
    LogOutputEvent,
    RendezvousEvent,
    DiagnosticsEvent,
    StoppedEventReason,
    ChanperfEvent,
    DebugServerLogOutputEvent,
    ChannelPublishedEvent,
    CustomRequestEvent,
    ClientToServerCustomEventName
} from './Events';
import type { LaunchConfiguration, ComponentLibraryConfiguration } from '../LaunchConfiguration';
import { FileManager } from '../managers/FileManager';
import { SourceMapManager } from '../managers/SourceMapManager';
import { LocationManager } from '../managers/LocationManager';
import type { AugmentedSourceBreakpoint } from '../managers/BreakpointManager';
import { BreakpointManager } from '../managers/BreakpointManager';
import type { LogMessage } from '../logging';
import { logger, FileLoggingManager, debugServerLogOutputEventTransport, LogLevelPriority } from '../logging';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import { DiagnosticSeverity } from 'brighterscript';
import type { ExceptionBreakpoint } from '../debugProtocol/events/requests/SetExceptionBreakpointsRequest';
import { debounce } from 'debounce';
import { interfaces, components, events } from 'brighterscript/dist/roku-types';
import { globalCallables } from 'brighterscript/dist/globalCallables';
import { bscProjectWorkerPool } from '../bsc/threading/BscProjectWorkerPool';
import { populateVariableFromRegistryEcp } from './ecpRegistryUtils';
import { AppState, rokuECP } from '../RokuECP';
import { SocketConnectionInUseError } from '../Exceptions';

const diagnosticSource = 'roku-debug';

export class BrightScriptDebugSession extends BaseDebugSession {
    public constructor() {
        super();

        // this debugger uses one-based lines and columns
        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        //give util a reference to this session to assist in logging across the entire module
        util._debugSession = this;
        this.fileManager = new FileManager();
        this.sourceMapManager = new SourceMapManager();
        this.locationManager = new LocationManager(this.sourceMapManager);
        this.breakpointManager = new BreakpointManager(this.sourceMapManager, this.locationManager);
        //send newly-verified breakpoints to vscode
        this.breakpointManager.on('breakpoints-verified', (data) => this.onDeviceBreakpointsChanged('changed', data));
        this.projectManager = new ProjectManager({
            breakpointManager: this.breakpointManager,
            locationManager: this.locationManager
        });
        this.fileLoggingManager = new FileLoggingManager();
    }

    private onDeviceBreakpointsChanged(eventName: 'changed' | 'new', data: { breakpoints: AugmentedSourceBreakpoint[] }) {
        this.logger.info('Sending verified device breakpoints to client', data);
        //send all verified breakpoints to the client
        for (const breakpoint of data.breakpoints) {
            const event: DebugProtocol.Breakpoint = {
                line: breakpoint.line,
                column: breakpoint.column,
                verified: breakpoint.verified,
                id: breakpoint.id,
                reason: breakpoint.reason,
                message: breakpoint.message,
                source: {
                    path: breakpoint.srcPath
                }
            };
            this.sendEvent(new BreakpointEvent(eventName, event));
        }
    }

    public logger = logger.createLogger(`[session]`);

    private readonly isWindowsPlatform = process.platform.startsWith('win');

    /**
     * A sequence used to help identify log statements for requests
     */
    private idCounter = 1;

    public fileManager: FileManager;

    public projectManager: ProjectManager;

    public fileLoggingManager: FileLoggingManager;

    public breakpointManager: BreakpointManager;

    public locationManager: LocationManager;

    public sourceMapManager: SourceMapManager;

    //set imports as class properties so they can be spied upon during testing
    public rokuDeploy = rokuDeploy as unknown as RokuDeploy;

    private componentLibraryServer = new ComponentLibraryServer();

    private rokuAdapterDeferred = defer<DebugProtocolAdapter | TelnetAdapter>();
    /**
     * A promise that is resolved whenever the app has started running for the first time
     */
    private firstRunDeferred = defer<void>();

    private evaluateRefIdLookup: Record<string, number> = {};
    private evaluateRefIdCounter = 1;

    private variables: Record<number, AugmentedVariable> = {};

    private rokuAdapter: DebugProtocolAdapter | TelnetAdapter;

    private rendezvousTracker: RendezvousTracker;

    public tempVarPrefix = '__rokudebug__';

    /**
     * The first encountered compile error, will be used to send to the client as a runtime error (nicer UI presentation)
     */
    private compileError: BSDebugDiagnostic;

    /**
     * A magic number to represent a fake thread that will be used for showing compile errors in the UI as if they were runtime crashes
     */
    private COMPILE_ERROR_THREAD_ID = 7_777;

    private get enableDebugProtocol() {
        return this.launchConfiguration.enableDebugProtocol;
    }

    /**
     * Get a promise that resolves when the roku adapter is ready to be used
     */
    private async getRokuAdapter() {
        await this.rokuAdapterDeferred.promise;
        await this.rokuAdapter.onReady();
        return this.rokuAdapter;
    }

    private launchConfiguration: LaunchConfiguration;
    private initRequestArgs: DebugProtocol.InitializeRequestArguments;

    private exceptionBreakpoints: ExceptionBreakpoint[] = [];

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    public initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.initRequestArgs = args;
        this.logger.log('initializeRequest');

        response.body = response.body || {};

        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;

        // The debug adapter supports the 'restart' request. In this case a client should not implement 'restart' by terminating and relaunching the adapter but by calling the RestartRequest.
        response.body.supportsRestartRequest = true;

        // make VS Code to use 'evaluate' when hovering over source
        response.body.supportsEvaluateForHovers = true;

        // make VS Code to show a 'step back' button
        response.body.supportsStepBack = false;

        // This debug adapter supports conditional breakpoints
        response.body.supportsConditionalBreakpoints = true;

        response.body.supportsExceptionFilterOptions = true;
        response.body.supportsExceptionOptions = true;

        //the list of exception breakpoints (we have to send them all the time, even if the device doesn't support them)
        response.body.exceptionBreakpointFilters = [{
            filter: 'caught',
            supportsCondition: true,
            conditionDescription: '__brs_err__.rethrown = true',
            label: 'Caught Exceptions',
            description: `Breaks on all errors, even if they're caught later.`,
            default: false
        }, {
            filter: 'uncaught',
            supportsCondition: true,
            conditionDescription: '__brs_err__.rethrown = true',
            label: 'Uncaught Exceptions',
            description: 'Breaks only on errors that are not handled.',
            default: true
        }];

        // This debug adapter supports breakpoints that break execution after a specified number of hits
        response.body.supportsHitConditionalBreakpoints = true;

        // This debug adapter supports log points by interpreting the 'logMessage' attribute of the SourceBreakpoint
        response.body.supportsLogPoints = true;

        response.body.supportsCompletionsRequest = true;
        response.body.completionTriggerCharacters = ['.', '(', '{', ',', ' '];

        this.sendResponse(response);

        //register the debug output log transport writer
        debugServerLogOutputEventTransport.setWriter((message: LogMessage) => {
            this.sendEvent(
                new DebugServerLogOutputEvent(
                    message.logger.formatMessage(message, false)
                )
            );
        });

        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());

        this.logger.log('initializeRequest finished');
    }

    protected async setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments) {
        response.body ??= {};
        try {

            let filterOptions: ExceptionBreakpoint[];
            if (args.filterOptions) {
                filterOptions = args.filterOptions.map(x => ({
                    filter: x.filterId as 'caught' | 'uncaught',
                    conditionExpression: x.condition
                }));
            } else if (args.filters) {
                filterOptions = args.filters.map(x => ({
                    filter: x as 'caught' | 'uncaught'
                }));
            }
            this.exceptionBreakpoints = filterOptions;

            //ensure the rokuAdapter is loaded
            await this.getRokuAdapter();

            if (this.rokuAdapter.supportsExceptionBreakpoints) {
                await this.rokuAdapter.setExceptionBreakpoints(filterOptions);
                //if success
                response.body.breakpoints = [
                    { verified: true },
                    { verified: true }
                ];
            } else {
                response.body.breakpoints = [
                    { verified: false },
                    { verified: false }
                ];
            }
        } catch (e) {
            //if error (or not supported)
            response.body.breakpoints = [
                { verified: false },
                { verified: false }
            ];
            this.logger.error('Failed to set exception breakpoints', e);
        } finally {
            this.sendResponse(response);
        }
    }


    protected async setTransientsToInvalid() {
        let brsErr = Object.values(this.variables).find((v) => v.name === '__brs_err__');
        if (brsErr && brsErr.type !== VariableType.Uninitialized) {
            // Assigning the variable to the function call results in it becoming unintialized
            await this.rokuAdapter.evaluate(`__brs_err__ = [].clear()`, brsErr.frameId);
        }
    }

    private async showPopupMessage<T extends string>(message: string, severity: 'error' | 'warn' | 'info', modal = false, actions?: T[]): Promise<T> {
        const response = await this.sendCustomRequest('showPopupMessage', { message: message, severity: severity, modal: modal, actions: actions });
        return response.selectedAction;
    }

    private static requestIdSequence = 0;

    private async sendCustomRequest<T = any, R = any>(name: string, data: T): Promise<R> {
        const requestId = BrightScriptDebugSession.requestIdSequence++;
        const responsePromise = new Promise<R>((resolve, reject) => {
            this.on(ClientToServerCustomEventName.customRequestEventResponse, (response) => {
                if (response.requestId === requestId) {
                    if (response.error) {
                        throw response.error;
                    } else {
                        resolve(response as R);
                    }
                }
            });
        });
        this.sendEvent(
            new CustomRequestEvent({
                requestId: requestId,
                name: name,
                ...data ?? {}
            }));
        return responsePromise;
    }

    /**
      * Get the cwd from the launchConfiguration, or default to process.cwd()
      */
    private get cwd() {
        return this.launchConfiguration?.cwd ?? process.cwd();
    }

    public deviceInfo: DeviceInfo;

    /**
     * Set defaults and standardize values for all of the LaunchConfiguration values
     * @param config
     * @returns
     */
    private normalizeLaunchConfig(config: LaunchConfiguration) {
        config.cwd ??= process.cwd();
        config.outDir ??= s`${config.cwd}/out`;
        config.stagingDir ??= s`${config.outDir}/.roku-deploy-staging`;
        config.componentLibrariesPort ??= 8080;
        config.packagePort ??= 80;
        config.remotePort ??= 8060;
        config.sceneGraphDebugCommandsPort ??= 8080;
        config.controlPort ??= 8081;
        config.brightScriptConsolePort ??= 8085;
        config.stagingDir ??= config.stagingFolderPath;
        config.emitChannelPublishedEvent ??= true;
        config.rewriteDevicePathsInLogs ??= true;
        config.autoResolveVirtualVariables ??= false;
        config.enhanceREPLCompletions ??= true;

        // migrate the old `enableVariablesPanel` setting to the new `deferScopeLoading` setting
        if (typeof config.enableVariablesPanel !== 'boolean') {
            config.enableVariablesPanel = true;
        }
        config.deferScopeLoading ??= config.enableVariablesPanel === false;
        return config;
    }

    public async launchRequest(response: DebugProtocol.LaunchResponse, config: LaunchConfiguration) {
        const logEnd = this.logger.timeStart('log', '[launchRequest] launch');

        this.resetSessionState();

        //send the response right away so the UI immediately shows the debugger toolbar
        this.sendResponse(response);

        this.launchConfiguration = this.normalizeLaunchConfig(config);

        //prebake some threads for our ProjectManager to use later on (1 for the main project, and 1 for every complib)
        bscProjectWorkerPool.preload(1 + (this.launchConfiguration?.componentLibraries?.length ?? 0));

        //set the logLevel provided by the launch config
        if (this.launchConfiguration.logLevel) {
            logger.logLevel = this.launchConfiguration.logLevel;
        }

        //do a DNS lookup for the host to fix issues with roku rejecting ECP
        try {
            this.launchConfiguration.host = await util.dnsLookup(this.launchConfiguration.host);
        } catch (e) {
            return this.shutdown(`Could not resolve ip address for host '${this.launchConfiguration.host}'`);
        }

        // fetches the device info and parses the xml data to JSON object
        try {
            this.deviceInfo = await rokuDeploy.getDeviceInfo({ host: this.launchConfiguration.host, remotePort: this.launchConfiguration.remotePort, enhance: true, timeout: 4_000 });
        } catch (e) {
            return this.shutdown(`Unable to connect to roku at '${this.launchConfiguration.host}'. Verify the IP address is correct and that the device is powered on and connected to same network as this computer.`);
        }

        if (this.deviceInfo && !this.deviceInfo.developerEnabled) {
            return this.shutdown(`Developer mode is not enabled for host '${this.launchConfiguration.host}'.`);
        }

        //initialize all file logging (rokuDevice, debugger, etc)
        this.fileLoggingManager.activate(this.launchConfiguration?.fileLogging, this.cwd);

        this.projectManager.launchConfiguration = this.launchConfiguration;
        this.breakpointManager.launchConfiguration = this.launchConfiguration;

        this.sendEvent(new LaunchStartEvent(this.launchConfiguration));

        let error: Error;
        this.logger.log('[launchRequest] Packaging and deploying to roku');
        try {
            const packageEnd = this.logger.timeStart('log', 'Packaging');
            //build the main project and all component libraries at the same time
            await this.prepareMainProject(),
            await this.prepareAndHostComponentLibraries(this.launchConfiguration.componentLibraries, this.launchConfiguration.componentLibrariesPort)
            packageEnd();

            if (this.enableDebugProtocol) {
                util.log(`Connecting to Roku via the BrightScript debug protocol at ${this.launchConfiguration.host}:${this.launchConfiguration.controlPort}`);
            } else {
                util.log(`Connecting to Roku via telnet at ${this.launchConfiguration.host}:${this.launchConfiguration.brightScriptConsolePort}`);
            }

            //activate rendezvous tracking (if enabled). Log the error and move on if it crashes, this shouldn't bring down the session.
            try {
                const rendezvousEnd = this.logger.timeStart('log', 'Rendezvous tracking');
                await this.initRendezvousTracking();
                rendezvousEnd();
            } catch (e) {
                this.logger.error('Failed to initialize rendezvous tracking', e);
            }

            const connectAdapterEnd = this.logger.timeStart('log', 'Connect adapter');
            this.createRokuAdapter(this.rendezvousTracker);
            await this.connectRokuAdapter();
            connectAdapterEnd();

            await this.runAutomaticSceneGraphCommands(this.launchConfiguration.autoRunSgDebugCommands);

            //press the home button to ensure we're at the home screen
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);

            //pass the log level down thought the adapter to the RendezvousTracker and ChanperfTracker
            this.rokuAdapter.setConsoleOutput(this.launchConfiguration.consoleOutput);

            //pass along the console output
            if (this.launchConfiguration.consoleOutput === 'full') {
                this.rokuAdapter.on('console-output', (data) => {
                    void this.sendLogOutput(data);
                });
            } else {
                this.rokuAdapter.on('unhandled-console-output', (data) => {
                    void this.sendLogOutput(data);
                });
            }

            this.rokuAdapter.on('device-unresponsive', async (data: { lastCommand: string }) => {
                const stopDebuggerAction = 'Stop Debugger';
                const message = `Roku device ${this.launchConfiguration.host} is not responding and may not recover.` +
                    (data.lastCommand ? `\n\nActive command:\n"${util.truncate(data.lastCommand, 30)}"` : '');
                this.logger.log(message, data);
                const response = await this.showPopupMessage(message, 'warn', false, [stopDebuggerAction]);
                if (response === stopDebuggerAction) {
                    await this.shutdown();
                }
            });

            // Send chanperf events to the extension
            this.rokuAdapter.on('chanperf', (output) => {
                this.sendEvent(new ChanperfEvent(output));
            });

            //listen for a closed connection (shut down when received)
            this.rokuAdapter.on('close', (reason = '') => {
                if (reason === 'compileErrors') {
                    error = new Error('compileErrors');
                } else {
                    error = new Error('Unable to connect to Roku. Is another device already connected?');
                }
            });

            // handle any compile errors
            this.rokuAdapter.on('diagnostics', (diagnostics: BSDebugDiagnostic[]) => {
                void this.handleDiagnostics(diagnostics);
            });

            // close disconnect if required when the app is exited
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.rokuAdapter.on('app-exit', async () => {
                this.resetSessionState();

                if (this.launchConfiguration.stopDebuggerOnAppExit) {
                    let message = `App exit event detected and launchConfiguration.stopDebuggerOnAppExit is true`;
                    message += ' - shutting down debug session';

                    this.logger.log('on app-exit', message);
                    this.sendEvent(new LogOutputEvent(message));
                    await this.shutdown();
                } else {
                    const message = 'App exit detected; but launchConfiguration.stopDebuggerOnAppExit is set to false, so keeping debug session running.';
                    this.logger.log('[launchRequest]', message);
                    this.sendEvent(new LogOutputEvent(message));
                    void this.rokuAdapter.once('connected').then(async () => {
                        await this.rokuAdapter.setExceptionBreakpoints(this.exceptionBreakpoints);
                    });
                }
            });

            await this.publish();

            //hack for certain roku devices that lock up when this event is emitted (no idea why!).
            if (this.launchConfiguration.emitChannelPublishedEvent) {
                this.sendEvent(new ChannelPublishedEvent(
                    this.launchConfiguration
                ));
            }

            //tell the adapter adapter that the channel has been launched.
            await this.rokuAdapter.activate();
            if (this.rokuAdapter.isDestroyed) {
                throw new Error('Debug session encountered an error');
            }
            if (!error) {
                if (this.rokuAdapter.connected) {
                    this.logger.info('Host connection was established before the main public process was completed');
                    this.logger.log(`deployed to Roku@${this.launchConfiguration.host}`);
                } else {
                    this.logger.info('Main public process was completed but we are still waiting for a connection to the host');
                    this.rokuAdapter.on('connected', (status) => {
                        if (status) {
                            this.logger.log(`deployed to Roku@${this.launchConfiguration.host}`);
                        }
                    });
                }
            } else {
                throw error;
            }

            //at this point, the project has been deployed. If we need to use a deep link, launch it now.
            if (this.launchConfiguration.deepLinkUrl) {
                //wait until the first entry breakpoint has been hit
                await this.firstRunDeferred.promise;
                //if we are at a breakpoint, continue
                await this.rokuAdapter.continue();
                //kill the app on the roku
                // await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
                //convert a hostname to an ip address
                const deepLinkUrl = await util.resolveUrl(this.launchConfiguration.deepLinkUrl);
                //send the deep link http request
                await util.httpPost(deepLinkUrl);
            }

        } catch (e) {
            //if the message is anything other than compile errors, we want to display the error
            if (!(e instanceof CompileError)) {
                util.log('Encountered an issue during the publish process');
                util.log((e as Error)?.stack);

                //send any compile errors to the client
                await this.rokuAdapter?.sendErrors();

                const message = (e instanceof SocketConnectionInUseError) ? e.message : (e?.stack ?? e);
                await this.shutdown(message as string, true);
            }
        }

        logEnd();
    }

    /**
     * Clear certain properties that need reset whenever a debug session is restarted (via vscode or launched from the Roku home screen)
     */
    private resetSessionState() {
        // launchRequest gets invoked by our restart session flow.
        // We need to clear/reset some state to avoid issues.
        this.entryBreakpointWasHandled = false;
        this.breakpointManager.clearBreakpointLastState();
    }

    /**
     * Activate rendezvous tracking (IF enabled in the LaunchConfig)
     */
    public async initRendezvousTracking() {
        const timeout = 5000;
        let initCompleted = false;
        await Promise.race([
            util.sleep(timeout),
            this._initRendezvousTracking().finally(() => {
                initCompleted = true;
            })
        ]);

        if (initCompleted === false) {
            this.showPopupMessage(`Rendezvous tracking timed out after ${timeout}ms. Consider setting "rendezvousTracking": false in launch.json`, 'warn').catch((error) => {
                this.logger.error('Error showing popup message', { error });
            });
        }
    }

    private async _initRendezvousTracking() {
        this.rendezvousTracker = new RendezvousTracker(this.deviceInfo, this.launchConfiguration);

        //pass the debug functions used to locate the client files and lines thought the adapter to the RendezvousTracker
        this.rendezvousTracker.registerSourceLocator(async (debuggerPath: string, lineNumber: number) => {
            return this.projectManager.getSourceLocation(debuggerPath, lineNumber);
        });

        // Send rendezvous events to the debug protocol client
        this.rendezvousTracker.on('rendezvous', (output) => {
            this.sendEvent(new RendezvousEvent(output));
        });

        //clear the history so the user doesn't have leftover rendezvous data from a previous session
        this.rendezvousTracker.clearHistory();

        //if rendezvous tracking is enabled, then enable it on the device
        if (this.launchConfiguration.rendezvousTracking !== false) {
            // start ECP rendezvous tracking (if possible)
            await this.rendezvousTracker.activate();
        }
    }

    /**
     * Anytime a roku adapter emits diagnostics, this method is called to handle it.
     */
    private async handleDiagnostics(diagnostics: BSDebugDiagnostic[]) {
        // Roku device and sourcemap work with 1-based line numbers, VSCode expects 0-based lines.
        for (let diagnostic of diagnostics) {
            diagnostic.source = diagnosticSource;
            let sourceLocation = await this.projectManager.getSourceLocation(diagnostic.path, diagnostic.range.start.line + 1);
            if (sourceLocation) {
                diagnostic.path = sourceLocation.filePath;
                diagnostic.range.start.line = sourceLocation.lineNumber - 1; //sourceLocation is 1-based, but we need 0-based
                diagnostic.range.end.line = sourceLocation.lineNumber - 1; //sourceLocation is 1-based, but we need 0-based
            } else {
                // TODO: may need to add a custom event if the source location could not be found by the ProjectManager
                diagnostic.path = fileUtils.removeLeadingSlash(util.removeFileScheme(diagnostic.path));
            }
        }

        //find the first compile error (i.e. first DiagnosticSeverity.Error) if there is one
        this.compileError = diagnostics.find(x => x.severity === DiagnosticSeverity.Error);
        if (this.compileError) {
            this.sendEvent(new StoppedEvent(
                StoppedEventReason.exception,
                this.COMPILE_ERROR_THREAD_ID,
                `CompileError: ${this.compileError.message}`
            ));
        }

        this.sendEvent(new DiagnosticsEvent(diagnostics));
    }

    private async publish() {
        const uploadingEnd = this.logger.timeStart('log', 'Uploading zip');
        let packageIsPublished = false;

        //delete any currently installed dev channel (if enabled to do so)
        try {
            if (this.launchConfiguration.deleteDevChannelBeforeInstall === true) {
                await this.rokuDeploy.deleteInstalledChannel({
                    ...this.launchConfiguration
                } as any as RokuDeployOptions);
            }
        } catch (e) {
            const statusCode = e?.results?.response?.statusCode;
            const message = e.message as string;
            if (statusCode === 401) {
                await this.shutdown(message, true);
                throw e;
            }
            this.logger.warn('Failed to delete the dev channel...probably not a big deal', e);
        }

        const isConnected = this.rokuAdapter.once('app-ready');
        const options: RokuDeployOptions = {
            ...this.launchConfiguration,
            //typing fix
            logLevel: LogLevelPriority[this.logger.logLevel],
            // enable the debug protocol if true
            remoteDebug: this.enableDebugProtocol,
            //necessary for capturing compile errors from the protocol (has no effect on telnet)
            remoteDebugConnectEarly: false,
            //we don't want to fail if there were compile errors...we'll let our compile error processor handle that
            failOnCompileError: true,
            //pass any upload form overrides the client may have configured
            packageUploadOverrides: this.launchConfiguration.packageUploadOverrides
        };
        //if packagePath is specified, use that info instead of outDir and outFile
        if (this.launchConfiguration.packagePath) {
            options.outDir = path.dirname(this.launchConfiguration.packagePath);
            options.outFile = path.basename(this.launchConfiguration.packagePath);
        }

        //publish the package to the target Roku
        const publishPromise = this.rokuDeploy.publish(options).then(() => {
            packageIsPublished = true;
        }).catch(async (e) => {
            const statusCode = e?.results?.response?.statusCode;
            const message = e.message as string;
            if ((statusCode && statusCode !== 200) || isUpdateCheckRequiredError(e) || isConnectionResetError(e)) {
                await this.shutdown(message, true);
                throw e;
            }
            this.logger.error(e);
        });

        await publishPromise;

        uploadingEnd();

        //the channel has been deployed. Wait for the adapter to finish connecting.
        //if it hasn't connected after 5 seconds, it probably will never connect.
        let didTimeOut = false;
        await Promise.race([
            isConnected,
            util.sleep(20_000).then(() => {
                didTimeOut = true;
            })
        ]);
        this.logger.log('Finished racing promises');
        if (didTimeOut) {
            this.logger.warn('Timed out waiting for roku to connect');
        }
        //if the adapter is still not connected, then it will probably never connect. Abort.
        if (packageIsPublished && !this.rokuAdapter.connected) {
            return this.shutdown('Debug session cancelled: failed to connect to debug protocol control port.');
        }
    }

    private pendingSendLogPromise = Promise.resolve();

    /**
     * Send log output to the "client" (i.e. vscode)
     * @param logOutput
     */
    private sendLogOutput(logOutput: string) {
        this.fileLoggingManager.writeRokuDeviceLog(logOutput);

        this.pendingSendLogPromise = this.pendingSendLogPromise.then(async () => {
            logOutput = await this.convertBacktracePaths(logOutput);

            const lines = logOutput.split(/\r?\n/g);
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (i < lines.length - 1) {
                    line += '\n';
                }

                if (this.launchConfiguration.rewriteDevicePathsInLogs) {
                    let potentialPaths = this.getPotentialPkgPaths(line);
                    for (let potentialPath of potentialPaths) {
                        let originalLocation = await this.projectManager.getSourceLocation(potentialPath.path, potentialPath.lineNumber, potentialPath.columnNumber);
                        if (originalLocation) {
                            let replacement: string;
                            replacement = originalLocation.filePath.replaceAll(' ', '%20');
                            if (replacement !== originalLocation.filePath) {
                                if (this.isWindowsPlatform) {
                                    replacement = `vscode://file/${replacement}`;
                                } else {
                                    replacement = `file://${replacement}`;
                                }
                            }
                            replacement += `:${originalLocation.lineNumber}`;
                            if (potentialPath.columnNumber !== undefined) {
                                replacement += `:${originalLocation.columnIndex + 1}`;
                            }

                            line = line.replaceAll(potentialPath.fullMatch, replacement);
                        }
                    }
                }
                this.sendEvent(new OutputEvent(line, 'stdout'));
                this.sendEvent(new LogOutputEvent(line));
            }
        });
        return this.pendingSendLogPromise;
    }

    /**
     * Extracts potential package paths from a given line of text.
     *
     * This method uses a regular expression to find matches in the provided line
     * and returns an array of objects containing details about each match.
     *
     * @param input - The line of text to search for potential package paths.
     * @returns An array of objects, each containing:
     *   - `fullMatch`: The full matched string.
     *   - `path`: The extracted path from the match.
     *   - `lineNumber`: The line number extracted from the match.
     *   - `columnNumber`: The column number extracted from the match, or `undefined` if not found.
     */
    private getPotentialPkgPaths(input: string): Array<{ fullMatch: string; path: string; lineNumber: number; columnNumber: number }> {
        // https://regex101.com/r/ixpQiq/1
        let matches = input.matchAll(/((?:\.\.\.|[A-Za-z_0-9]*pkg\:\/)[A-Za-z_0-9 \/\.]+\.[A-Za-z_0-9 \/]+)(?:(?:\:)(\d+)(?:\:(\d+))?|\((\d+)(?:\:(\d+))?\))/ig);
        let paths: ReturnType<BrightScriptDebugSession['getPotentialPkgPaths']> = [];
        if (matches) {
            for (let match of matches) {
                let fullMatch = match[0];
                let path = match[1];
                let lineNumber = parseInt(match[2] ?? match[4]);
                let columnNumber = parseInt(match[3] ?? match[5]);
                if (isNaN(columnNumber)) {
                    columnNumber = undefined;
                }
                paths.push({
                    fullMatch: fullMatch,
                    path: path,
                    lineNumber: lineNumber,
                    columnNumber: columnNumber
                });
            }
        }
        return paths;
    }

    /**
     * Converts the filename property in backtrace objects in the given input string to source paths if found
     */
    private async convertBacktracePaths(input: string) {
        if (!this.launchConfiguration.rewriteDevicePathsInLogs) {
            return input;
        }
        // Why does this not work? It should work, but it doesn't. I'm not sure why.
        // let matches = input.matchAll(this.deviceBacktraceObjectRegex);

        // https://regex101.com/r/y1koaV/2
        let deviceBacktraceObjectRegex = /{\s+filename:\s+"([A-Za-z0-9_\.\/\: ]+)"\s+function\:\s+".+"\s+(line_number\:\s+(\d+))\s+}/gi;
        let matches = [];
        let match = deviceBacktraceObjectRegex.exec(input);
        while (match) {
            matches.push(match);
            match = deviceBacktraceObjectRegex.exec(input);
        }

        if (matches) {
            for (let match of matches) {
                let fullMatch = match[0] as string;
                let filePath = match[1] as string;
                let fullLineNumber = match[2] as string;
                let lineNumber = parseInt(match[3] as string);
                let originalLocation = await this.projectManager.getSourceLocation(filePath, lineNumber);
                if (originalLocation) {
                    let fileReplacement: string;
                    fileReplacement = originalLocation.filePath.replaceAll(' ', '%20');
                    if (fileReplacement !== originalLocation.filePath) {
                        if (this.isWindowsPlatform) {
                            fileReplacement = `vscode://file/${fileReplacement}`;
                        } else {
                            fileReplacement = `file://${fileReplacement}`;
                        }
                    }
                    fileReplacement += `:${originalLocation.lineNumber}`;

                    let lineNumberReplacement = fullLineNumber.replace(lineNumber.toString(), originalLocation.lineNumber.toString());

                    // replace the full backtrace object with the an updated version so we don't modify other parts of the log output that might contain the same file path
                    let completeReplacement = fullMatch.replace(filePath, fileReplacement);
                    completeReplacement = completeReplacement.replace(fullLineNumber, lineNumberReplacement);
                    input = input.replaceAll(fullMatch, completeReplacement);
                }

            }
        }

        return input;
    }

    private async runAutomaticSceneGraphCommands(commands: string[]) {
        if (commands) {
            let connection = new SceneGraphDebugCommandController(this.launchConfiguration.host, this.launchConfiguration.sceneGraphDebugCommandsPort);

            try {
                await connection.connect();
                for (let command of this.launchConfiguration.autoRunSgDebugCommands) {
                    let response: SceneGraphCommandResponse;
                    switch (command) {
                        case 'chanperf':
                            util.log('Enabling Chanperf Tracking');
                            response = await connection.chanperf({ interval: 1 });
                            if (!response.error) {
                                util.log(response.result.rawResponse);
                            }
                            break;

                        case 'fpsdisplay':
                            util.log('Enabling FPS Display');
                            response = await connection.fpsDisplay('on');
                            if (!response.error) {
                                util.log(response.result.data as string);
                            }
                            break;

                        case 'logrendezvous':
                            util.log('Enabling Rendezvous Logging:');
                            response = await connection.logrendezvous('on');
                            if (!response.error) {
                                util.log(response.result.rawResponse);
                            }
                            break;

                        default:
                            util.log(`Running custom SceneGraph debug command on port 8080 '${command}':`);
                            response = await connection.exec(command);
                            if (!response.error) {
                                util.log(response.result.rawResponse);
                            }
                            break;
                    }
                }
                await connection.end();
            } catch (error) {
                util.log(`Error connecting to port 8080: ${error.message}`);
            }
        }
    }

    /**
     * Stage, insert breakpoints, and package the main project
     */
    public async prepareMainProject() {
        //add the main project
        this.projectManager.mainProject = new Project({
            rootDir: this.launchConfiguration.rootDir,
            files: this.launchConfiguration.files,
            outDir: this.launchConfiguration.outDir,
            sourceDirs: this.launchConfiguration.sourceDirs,
            bsConst: this.launchConfiguration.bsConst,
            injectRaleTrackerTask: this.launchConfiguration.injectRaleTrackerTask,
            raleTrackerTaskFileLocation: this.launchConfiguration.raleTrackerTaskFileLocation,
            injectRdbOnDeviceComponent: this.launchConfiguration.injectRdbOnDeviceComponent,
            rdbFilesBasePath: this.launchConfiguration.rdbFilesBasePath,
            stagingDir: this.launchConfiguration.stagingDir,
            packagePath: this.launchConfiguration.packagePath,
            enhanceREPLCompletions: this.launchConfiguration.enhanceREPLCompletions
        });

        util.log('Moving selected files to staging area');
        await this.projectManager.mainProject.stage();

        //add the entry breakpoint if stopOnEntry is true
        await this.handleEntryBreakpoint();

        //add breakpoint lines to source files and then publish
        util.log('Adding stop statements for active breakpoints');

        //write the `stop` statements to every file that has breakpoints (do for telnet, skip for debug protocol)
        if (!this.enableDebugProtocol) {

            await this.breakpointManager.writeBreakpointsForProject(this.projectManager.mainProject);
        }

        if (this.launchConfiguration.packageTask) {
            util.log(`Executing task '${this.launchConfiguration.packageTask}' to assemble the app`);
            await this.sendCustomRequest('executeTask', { task: this.launchConfiguration.packageTask });

            const options = {
                ...this.launchConfiguration
            } as any as RokuDeployOptions;
            //if packagePath is specified, use that info instead of outDir and outFile
            if (this.launchConfiguration.packagePath) {
                options.outDir = path.dirname(this.launchConfiguration.packagePath);
                options.outFile = path.basename(this.launchConfiguration.packagePath);
            }
            const packagePath = this.launchConfiguration.packagePath ?? rokuDeploy.getOutputZipFilePath(options);

            if (!fsExtra.pathExistsSync(packagePath as string)) {
                return this.shutdown(`Cancelling debug session. Package does not exist at '${packagePath}'`);
            }
        } else {
            //create zip package from staging folder
            util.log('Creating zip archive from project sources');
            await this.projectManager.mainProject.zipPackage({ retainStagingFolder: true });
        }
    }

    /**
     * Accepts custom events and requests from the extension
     * @param command name of the command to execute
     */
    protected customRequest(command: string, response: DebugProtocol.Response, args: any) {
        if (command === 'rendezvous.clearHistory') {
            this.rokuAdapter.clearRendezvousHistory();

        } else if (command === 'chanperf.clearHistory') {
            this.rokuAdapter.clearChanperfHistory();

        } else if (command === 'customRequestEventResponse') {
            this.emit('customRequestEventResponse', args);

        } else if (command === 'popupMessageEventResponse') {
            this.emit('popupMessageEventResponse', args);
        }
        this.sendResponse(response);
    }

    /**
     * Stores the path to the staging folder for each component library
     */
    protected async prepareAndHostComponentLibraries(componentLibraries: ComponentLibraryConfiguration[], port: number) {
        if (componentLibraries && componentLibraries.length > 0) {
            let componentLibrariesOutDir = s`${this.launchConfiguration.outDir}/component-libraries`;
            //make sure this folder exists (and is empty)
            await fsExtra.ensureDir(componentLibrariesOutDir);
            await fsExtra.emptyDir(componentLibrariesOutDir);

            //create a ComponentLibraryProject for each component library
            for (let libraryIndex = 0; libraryIndex < componentLibraries.length; libraryIndex++) {
                let componentLibrary = componentLibraries[libraryIndex];

                const commonParams = {
                        rootDir: componentLibrary.rootDir,
                        files: componentLibrary.files,
                        outDir: componentLibrariesOutDir,
                        outFile: componentLibrary.outFile,
                        sourceDirs: componentLibrary.sourceDirs,
                        bsConst: componentLibrary.bsConst,
                        injectRaleTrackerTask: componentLibrary.injectRaleTrackerTask,
                        raleTrackerTaskFileLocation: componentLibrary.raleTrackerTaskFileLocation,
                        libraryIndex: libraryIndex,
                        enhanceREPLCompletions: this.launchConfiguration.enhanceREPLCompletions
                }

                if (componentLibrary.appType) {
                  this.projectManager.componentLibraryProjects.push(
                      new ComponentLibraryDCLProject({
                          ...commonParams,
                          host: componentLibrary.host,
                          username: componentLibrary.username,
                          password: componentLibrary.password
                      })
                  );
                } else if (componentLibrary.cmd) {
                    this.projectManager.componentLibraryProjects.push(
                        new ComponentLibraryProjectWithCustomCMDToRun({
                            ...commonParams,
                            cmdToRun: componentLibrary.cmd
                        })
                    );
                } else {
                    this.projectManager.componentLibraryProjects.push(
                        new ComponentLibraryProject(commonParams)
                    );
                }
            }

            //prepare all of the libraries in parallel
            let compLibPromises = this.projectManager.componentLibraryProjects.map(async (compLibProject) => {

                await compLibProject.stage();

                // Add breakpoint lines to the staging files and before publishing
                util.log('Adding stop statements for active breakpoints in Component Libraries');

                //write the `stop` statements to every file that has breakpoints (do for telnet, skip for debug protocol)
                if (!this.enableDebugProtocol) {
                    await this.breakpointManager.writeBreakpointsForProject(compLibProject);
                }

                await compLibProject.postfixFiles();

                await compLibProject.zipPackage({ retainStagingFolder: true });

                await compLibProject.publish();
            });

            let hostingPromise: Promise<any>;
            if (compLibPromises) {
                // prepare static file hosting
                hostingPromise = this.componentLibraryServer.startStaticFileHosting(componentLibrariesOutDir, port, (message: string) => {
                    util.log(message);
                });
            }

            //wait for all component libaries to finish building, and the file hosting to start up
            await Promise.all([
                ...compLibPromises,
                hostingPromise
            ]);
        }
    }

    protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments) {
        this.logger.log('sourceRequest');
        let old = this.sendResponse;
        this.sendResponse = function sendResponse(...args) {
            old.apply(this, args);
            this.sendResponse = old;
        };
        super.sourceRequest(response, args);
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments) {
        this.logger.log('configurationDoneRequest');
    }

    /**
     * Called every time a breakpoint is created, modified, or deleted, for each file. This receives the entire list of breakpoints every time.
     */
    public async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
        this.logger.log('setBreakpointsRequest', args);
        let sanitizedBreakpoints = this.breakpointManager.replaceBreakpoints(args.source.path, args.breakpoints);
        //sort the breakpoints
        let sortedAndFilteredBreakpoints = orderBy(sanitizedBreakpoints, [x => x.line, x => x.column]);

        response.body = {
            breakpoints: sortedAndFilteredBreakpoints
        };
        this.sendResponse(response);

        await this.rokuAdapter?.syncBreakpoints();
    }

    protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments) {
        this.logger.log('exceptionInfoRequest');
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse) {
        this.logger.log('threadsRequest');

        let threads = [];

        //This is a bit of a hack. If there's a compile error, send a thread to represent it so we can show the compile error like a runtime exception
        if (this.compileError) {
            threads.push(new Thread(this.COMPILE_ERROR_THREAD_ID, 'Compile Error'));
        } else {
            //wait for the roku adapter to load
            await this.getRokuAdapter();

            //only send the threads request if we are at the debugger prompt
            if (this.rokuAdapter.isAtDebuggerPrompt) {
                let rokuThreads = await this.rokuAdapter.getThreads();

                for (let thread of rokuThreads) {
                    threads.push(
                        new Thread(thread.threadId, `Thread ${thread.threadId}`)
                    );
                }

                if (threads.length === 0) {
                    threads = [{
                        id: 1001,
                        name: 'unable to retrieve threads: not stopped',
                        isFake: true
                    }];
                }

            } else {
                this.logger.log('Skipped getting threads because the RokuAdapter is not accepting input at this time.');
            }

        }

        response.body = {
            threads: threads
        };

        this.sendResponse(response);
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
        try {
            this.logger.log('stackTraceRequest');
            let frames: DebugProtocol.StackFrame[] = [];

            //this is a bit of a hack. If there's a compile error, send a full stack frame so we can show the compile error like a runtime crash
            if (this.compileError) {
                frames.push(new StackFrame(
                    0,
                    'Compile Error',
                    new Source(path.basename(this.compileError.path), this.compileError.path),
                    //diagnostics are 0 based, vscode expects 1 based
                    this.compileError.range.start.line + 1,
                    this.compileError.range.start.character + 1
                ));
            } else if (args.threadId === 1001) {
                frames.push(new StackFrame(
                    0,
                    'ERROR: threads would not stop',
                    new Source('main.brs', s`${this.launchConfiguration.stagingDir}/manifest`),
                    1,
                    1
                ));
                this.showPopupMessage('Unable to suspend threads. Debugger is in an unstable state, please press Continue to resume debugging', 'warn').catch((error) => {
                    this.logger.error('Error showing popup message', { error });
                });
            } else {
                //ensure the rokuAdapter is loaded
                await this.getRokuAdapter();

                if (this.rokuAdapter.isAtDebuggerPrompt) {
                    let stackTrace = await this.rokuAdapter.getStackTrace(args.threadId);

                    for (let debugFrame of stackTrace) {
                        let sourceLocation = await this.projectManager.getSourceLocation(debugFrame.filePath, debugFrame.lineNumber);

                        //the stacktrace returns function identifiers in all lower case. Try to get the actual case
                        //load the contents of the file and get the correct casing for the function identifier
                        try {
                            let functionName = this.fileManager.getCorrectFunctionNameCase(sourceLocation?.filePath, debugFrame.functionIdentifier);
                            if (functionName) {

                                //search for original function name if this is an anonymous function.
                                //anonymous function names are prefixed with $ in the stack trace (i.e. $anon_1 or $functionname_40002)
                                if (functionName.startsWith('$')) {
                                    functionName = this.fileManager.getFunctionNameAtPosition(
                                        sourceLocation.filePath,
                                        sourceLocation.lineNumber - 1,
                                        functionName
                                    );
                                }
                                debugFrame.functionIdentifier = functionName;
                            }
                        } catch (error) {
                            this.logger.error('Error correcting function identifier case', { error, sourceLocation, debugFrame });
                        }
                        const filePath = sourceLocation?.filePath ?? debugFrame.filePath;

                        const frame: DebugProtocol.StackFrame = new StackFrame(
                            debugFrame.frameId,
                            `${debugFrame.functionIdentifier}`,
                            new Source(path.basename(filePath), filePath),
                            sourceLocation?.lineNumber ?? debugFrame.lineNumber,
                            1
                        );
                        if (!sourceLocation) {
                            frame.presentationHint = 'subtle';
                        }
                        frames.push(frame);
                    }
                } else {
                    this.logger.log('Skipped calculating stacktrace because the RokuAdapter is not accepting input at this time');
                }
            }
            response.body = {
                stackFrames: frames,
                totalFrames: frames.length
            };
            this.sendResponse(response);
        } catch (error) {
            this.logger.error('Error getting stacktrace', { error, args });
        }
    }

    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
        const logger = this.logger.createLogger(`scopesRequest ${this.idCounter}`);
        logger.info('begin', { args });
        try {
            const scopes = new Array<DebugProtocol.Scope>();
            let v: AugmentedVariable;

            // create the locals scope
            let localsRefId = this.getEvaluateRefId('$$locals', args.frameId);
            if (this.variables[localsRefId]) {
                v = this.variables[localsRefId];
            } else {
                v = {
                    variablesReference: localsRefId,
                    name: 'Locals',
                    value: '',
                    type: '$$Locals',
                    frameId: args.frameId,
                    isScope: true,
                    childVariables: []
                };
                this.variables[localsRefId] = v;
            }

            let localScope: DebugProtocol.Scope = {
                name: 'Local',
                variablesReference: v.variablesReference,
                // Flag the locals scope as expensive if the client asked that it be loaded lazily
                expensive: this.launchConfiguration.deferScopeLoading,
                presentationHint: 'locals'
            };

            const frame = this.rokuAdapter.getStackFrameById(args.frameId);
            if (frame) {
                const scopeRange = await this.projectManager.getScopeRange(frame.filePath, { line: frame.lineNumber - 1, character: 0 });

                if (scopeRange) {
                    localScope.line = this.toClientLine(scopeRange.start.line - 1);
                    localScope.column = this.toClientColumn(scopeRange.start.column);
                    localScope.endLine = this.toClientLine(scopeRange.end.line - 1);
                    localScope.endColumn = this.toClientColumn(scopeRange.end.column);
                }
            }

            scopes.push(localScope);

            // create the registry scope
            let registryRefId = this.getEvaluateRefId('$$registry', Infinity);
            scopes.push(<DebugProtocol.Scope>{
                name: 'Registry',
                variablesReference: registryRefId,
                expensive: true
            });

            this.variables[registryRefId] = {
                variablesReference: registryRefId,
                name: 'Registry',
                value: '',
                type: '$$Registry',
                isScope: true,
                childVariables: []
            };

            response.body = {
                scopes: scopes
            };
            logger.debug('send response', { response });
            this.sendResponse(response);
            logger.info('end');
        } catch (error) {
            logger.error('Error getting scopes', { error, args });
        }
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
        //if we have a compile error, we should shut down
        if (this.compileError) {
            this.sendResponse(response);
            await this.shutdown();
            return;
        }

        this.logger.log('continueRequest');
        await this.setTransientsToInvalid(); // call before clearState
        this.clearState();

        // The debug session ends after the next line. Do not put new work after this line.
        await this.rokuAdapter.continue();
        this.sendResponse(response);
    }

    protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
        this.logger.log('pauseRequest');

        //if we have a compile error, we should shut down
        if (this.compileError) {
            this.sendResponse(response);
            await this.shutdown();
            return;
        }

        await this.rokuAdapter.pause();
        this.sendResponse(response);
    }

    protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) {
        this.logger.log('reverseContinueRequest');
        this.sendResponse(response);
    }

    /**
     * Clicked the "Step Over" button
     * @param response
     * @param args
     */
    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
        this.logger.log('[nextRequest] begin');

        //if we have a compile error, we should shut down
        if (this.compileError) {
            this.sendResponse(response);
            await this.shutdown();
            return;
        }

        await this.setTransientsToInvalid(); // call before clearState
        this.clearState();

        // The debug session ends after the next line. Do not put new work after this line.
        try {
            await this.rokuAdapter.stepOver(args.threadId);
            this.logger.info('[nextRequest] end');
        } catch (error) {
            this.logger.error(`[nextRequest] Error running '${BrightScriptDebugSession.prototype.nextRequest.name}()'`, error);
        }
        this.sendResponse(response);
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
        this.logger.log('[stepInRequest]');

        //if we have a compile error, we should shut down
        if (this.compileError) {
            this.sendResponse(response);
            await this.shutdown();
            return;
        }

        await this.setTransientsToInvalid(); // call before clearState
        this.clearState();
        // The debug session ends after the next line. Do not put new work after this line.
        await this.rokuAdapter.stepInto(args.threadId);
        this.sendResponse(response);
        this.logger.info('[stepInRequest] end');
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
        this.logger.log('[stepOutRequest] begin');

        //if we have a compile error, we should shut down
        if (this.compileError) {
            this.sendResponse(response);
            await this.shutdown();
            return;
        }

        await this.setTransientsToInvalid(); // call before clearState
        this.clearState();

        // The debug session ends after the next line. Do not put new work after this line.
        await this.rokuAdapter.stepOut(args.threadId);
        this.sendResponse(response);
        this.logger.info('[stepOutRequest] end');
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments) {
        this.logger.log('[stepBackRequest] begin');
        this.sendResponse(response);
        this.logger.info('[stepBackRequest] end');
    }

    public async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
        const logger = this.logger.createLogger('[variablesRequest]');
        let sendInvalidatedEvent = false;
        let frameId: number = null;
        try {
            logger.log('begin', { args });

            //ensure the rokuAdapter is loaded
            await this.getRokuAdapter();

            let updatedVariables: AugmentedVariable[] = [];
            //wait for any `evaluate` commands to finish so we have a higher likely hood of being at a debugger prompt
            await this.evaluateRequestPromise;
            if (this.rokuAdapter?.isAtDebuggerPrompt !== true) {
                logger.log('Skipped getting variables because the RokuAdapter is not accepting input at this time');
                response.success = false;
                response.message = 'Debug session is not paused';
                return this.sendResponse(response);
            }

            //find the variable with this reference
            let v = this.variables[args.variablesReference];
            if (!v) {
                response.success = false;
                response.message = `Variable reference has expired`;
                return this.sendResponse(response);
            }
            logger.log('variable', v);

            // Populate scope level values if needed
            if (v.isScope) {
                await this.populateScopeVariables(v, args);
            }

            //query for child vars if we haven't done it yet or DAP is asking to resolve a lazy variable
            if (v.childVariables.length === 0 || v.isResolved) {
                let tempVar: AugmentedVariable;
                if (!v.isResolved) {
                    // Evaluate the variable
                    try {
                        let { evalArgs } = await this.evaluateExpressionToTempVar({ expression: v.evaluateName, frameId: v.frameId }, util.getVariablePath(v.evaluateName));
                        let result = await this.rokuAdapter.getVariable(evalArgs.expression, v.frameId);
                        tempVar = await this.getVariableFromResult(result, v.frameId);
                        tempVar.frameId = v.frameId;
                        // Determine if the variable has changed
                        sendInvalidatedEvent = v.type !== tempVar.type || v.indexedVariables !== tempVar.indexedVariables;
                    } catch (error) {
                        logger.error('Error getting variables', error);
                        tempVar = new Variable('Error', `❌ Error: ${error.message}`);
                        tempVar.type = '';
                        tempVar.childVariables = [];
                        sendInvalidatedEvent = true;
                        response.success = false;
                        response.message = error.message;
                    }

                    // Merge the resulting updates together
                    v.childVariables = tempVar.childVariables;
                    v.value = tempVar.value;
                    v.type = tempVar.type;
                    v.indexedVariables = tempVar.indexedVariables;
                    v.namedVariables = tempVar.namedVariables;
                }
                frameId = v.frameId;

                if (v?.presentationHint?.lazy || v.isResolved) {
                    // If this was a lazy variable we need to respond with the updated variable and not the children
                    if (v.isResolved && v.childVariables.length > 0) {
                        updatedVariables = v.childVariables;
                    } else {
                        updatedVariables = [v];
                    }
                    v.isResolved = true;
                } else {
                    updatedVariables = v.childVariables;
                }

                // If the variable has no children, set the reference to 0
                // so it does not look expandable in the Ui
                if (v.childVariables.length === 0) {
                    v.variablesReference = 0;
                }

                // If the variable was resolve in the past we may not have fetched a new temp var
                tempVar ??= v;
                if (v?.presentationHint) {
                    v.presentationHint.lazy = tempVar.presentationHint?.lazy;
                } else {
                    v.presentationHint = tempVar.presentationHint;
                }

            } else {
                updatedVariables = v.childVariables;
            }

            // Only send the updated variables if we are not going to trigger an invalidated event.
            // This is to prevent the UI from updating twice and makes the experience much smoother to the end user.
            response.body = {
                variables: this.filterVariablesUpdates(updatedVariables, args, this.variables[args.variablesReference])
                // TODO: Re-enable this when we can send the correct variables based on the initial inspect context
                // variables: sendInvalidatedEvent ? [] : this.filterVariablesUpdates(updatedVariables, args, this.variables[args.variablesReference])
            };
        } catch (error) {
            logger.error('Error during variablesRequest', error, { args });
            response.success = false;
            response.message = error?.message ?? 'Error during variablesRequest';
        } finally {
            logger.info('end', { response });
        }
        this.sendResponse(response);
        if (sendInvalidatedEvent) {
            this.debounceSendInvalidatedEvent(null, frameId);
        }
    }

    private debounceSendInvalidatedEvent = debounce((threadId: number, frameId: number) => {
        this.sendInvalidatedEvent(threadId, frameId);
    }, 50);


    private filterVariablesUpdates(updatedVariables: Array<AugmentedVariable>, args: DebugProtocol.VariablesArguments, v: DebugProtocol.Variable): Array<AugmentedVariable> {
        if (!updatedVariables || !v) {
            return [];
        }

        let start = args.start ?? 0;

        //if the variable is an array, send only the requested range
        if (Array.isArray(updatedVariables) && args.filter === 'indexed') {
            //only send the variable range requested by the debugger
            if (!args.count) {
                updatedVariables = updatedVariables.slice(0, v.indexedVariables);
            } else {
                updatedVariables = updatedVariables.slice(start, start + args.count);
            }
        }

        if (Array.isArray(updatedVariables) && args.filter === 'named') {
            // We currently do not support named variable paging so we always send all named variables
            updatedVariables = updatedVariables.slice(v.indexedVariables);
        }

        let filteredUpdatedVariables = this.launchConfiguration.showHiddenVariables !== true ? updatedVariables.filter(
            (child: AugmentedVariable) => !child.name.startsWith(this.tempVarPrefix)) : updatedVariables;

        if (this.launchConfiguration.showHiddenVariables !== true) {
            filteredUpdatedVariables = filteredUpdatedVariables.filter((child: AugmentedVariable) => {
                //A transient variable that we show when there is a value
                if (child.name === '__brs_err__' && child.type !== VariableType.Uninitialized) {
                    return true;
                } else if (util.isTransientVariable(child.name)) {
                    return false;
                } else {
                    return true;
                }
            });
        }

        return filteredUpdatedVariables;
    }

    /**
     * Takes a scope variable and populates its child variables based on the scope type and the current adapter type.
     * @param v scope variable to populate
     * @param args
     */
    private async populateScopeVariables(v: AugmentedVariable, args: DebugProtocol.VariablesArguments) {
        if (v.childVariables.length > 0) {
            // Already populated
            return;
        }

        let tempVar: AugmentedVariable;
        try {
            if (v.type === '$$Locals') {
                if (this.rokuAdapter.isDebugProtocolAdapter()) {
                    let result = await this.rokuAdapter.getLocalVariables(v.frameId);
                    tempVar = await this.getVariableFromResult(result, v.frameId);
                } else if (this.rokuAdapter.isTelnetAdapter()) {
                    // NOTE: Legacy telnet support
                    let variables: AugmentedVariable[] = [];
                    const varNames = await this.rokuAdapter.getScopeVariables();

                    // Fetch each variable individually
                    for (const varName of varNames) {
                        let { evalArgs } = await this.evaluateExpressionToTempVar({ expression: varName, frameId: -1 }, util.getVariablePath(varName));
                        let result = await this.rokuAdapter.getVariable(evalArgs.expression, -1);
                        let tempLocalsVar = await this.getVariableFromResult(result, -1);
                        variables.push(tempLocalsVar);
                    }
                    tempVar = {
                        ...v,
                        childVariables: variables,
                        namedVariables: variables.length,
                        indexedVariables: 0
                    };
                }

                // Merge the resulting updates together onto the original variable
                v.childVariables = tempVar.childVariables;
                v.namedVariables = tempVar.namedVariables;
                v.indexedVariables = tempVar.indexedVariables;
            } else if (v.type === '$$Registry') {
                // This is a special scope variable used to load registry data via an ECP call
                // Send the registry ECP call for the `dev` app as side loaded apps are always `dev`
                await populateVariableFromRegistryEcp({ host: this.launchConfiguration.host, remotePort: this.launchConfiguration.remotePort, appId: 'dev' }, v, this.variables, this.getEvaluateRefId.bind(this));
            }
        } catch (error) {
            logger.error(`Error getting variables for scope ${v.type}`, error);
            tempVar = {
                name: '',
                value: `❌ Error: ${error.message}`,
                variablesReference: 0,
                childVariables: []
            };
            v.childVariables = [tempVar];
            v.namedVariables = 1;
            v.indexedVariables = 0;
        }

        // Mark the scope as resolved so we don't re-fetch the variables
        v.isResolved = true;

        // If the scope has no children, add a single child to indicate there are no values
        if (v.childVariables.length === 0) {
            tempVar = {
                name: '',
                value: `No values for scope '${v.name}'`,
                variablesReference: 0,
                childVariables: []
            };
            v.childVariables = [tempVar];
            v.namedVariables = 1;
            v.indexedVariables = 0;
        }
    }

    private evaluateRequestPromise = Promise.resolve();
    private evaluateVarIndexByFrameId = new Map<number, number>();

    private getNextVarIndex(frameId: number): number {
        if (!this.evaluateVarIndexByFrameId.has(frameId)) {
            this.evaluateVarIndexByFrameId.set(frameId, 0);
        }
        let value = this.evaluateVarIndexByFrameId.get(frameId);
        this.evaluateVarIndexByFrameId.set(frameId, value + 1);
        return value;
    }

    public async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
        //ensure the rokuAdapter is loaded
        await this.getRokuAdapter();

        let deferred = defer<void>();
        if (args.context === 'repl' && this.rokuAdapter.isTelnetAdapter() && args.expression.trim().startsWith('>')) {
            this.clearState();
            this.rokuAdapter.clearCache();
            const expression = args.expression.replace(/^\s*>\s*/, '');
            this.logger.log('Sending raw telnet command...I sure hope you know what you\'re doing', { expression });
            this.rokuAdapter.requestPipeline.client.write(`${expression}\r\n`);
            this.sendResponse(response);
            return deferred.promise;
        }

        try {
            this.evaluateRequestPromise = this.evaluateRequestPromise.then(() => {
                return deferred.promise;
            });

            //fix vscode hover bug that excludes closing quotemark sometimes.
            if (args.context === 'hover') {
                args.expression = util.ensureClosingQuote(args.expression);
            }

            if (!this.rokuAdapter.isAtDebuggerPrompt) {
                let message = 'Skipped evaluate request because RokuAdapter is not accepting requests at this time';
                if (args.context === 'repl') {
                    this.sendEvent(new OutputEvent(message, 'stderr'));
                    response.body = {
                        result: 'invalid',
                        variablesReference: 0
                    };
                } else {
                    throw new Error(message);
                }

                //is at debugger prompt
            } else if (args.expression.trim()) {
                // We trim and check that the expression is not an empty string so that we do not send empty expressions to the Roku
                // This happens mostly when hovering over leading whitespace in the editor

                let { evalArgs, variablePath } = await this.evaluateExpressionToTempVar(args, util.getVariablePath(args.expression));

                //if we found a variable path (e.g. ['a', 'b', 'c']) then do a variable lookup because it's faster and more widely supported than `evaluate`
                if (variablePath) {
                    let refId = this.getEvaluateRefId(evalArgs.expression, evalArgs.frameId);
                    let v: AugmentedVariable;
                    //if we already looked this item up, return it
                    if (this.variables[refId]) {
                        v = this.variables[refId];
                    } else {
                        let result = await this.rokuAdapter.getVariable(evalArgs.expression, evalArgs.frameId);
                        if (!result) {
                            throw new Error('Error: unable to evaluate expression');
                        }

                        v = await this.getVariableFromResult(result, evalArgs.frameId);
                        //TODO - testing something, remove later
                        // eslint-disable-next-line camelcase
                        v.request_seq = response.request_seq;
                        v.frameId = evalArgs.frameId;
                    }
                    response.body = {
                        result: v.value,
                        type: v.type,
                        variablesReference: v.variablesReference,
                        namedVariables: v.namedVariables || 0,
                        indexedVariables: v.indexedVariables || 0
                    };

                    //run an `evaluate` call
                } else {
                    let commandResults = await this.rokuAdapter.evaluate(evalArgs.expression, evalArgs.frameId);

                    commandResults.message = util.trimDebugPrompt(commandResults.message);
                    if (args.context === 'repl') {
                        // Clear variable cache since this action could have side-effects
                        // Only do this for REPL requests as hovers and watches should not clear the cache
                        this.clearState();
                        this.sendInvalidatedEvent(null, evalArgs.frameId);
                    }

                    // If the adapter captured output (probably only telnet), log the results
                    if (typeof commandResults.message === 'string') {
                        this.logger.debug('evaluateRequest', { commandResults });
                        if (args.context === 'repl') {
                            // If the command was a repl command, send the output to the debug console for the developer as well
                            // We limit this to repl only so you don't get extra logs when hovering over variables ro running watches
                            this.sendEvent(new OutputEvent(commandResults.message, commandResults.type === 'error' ? 'stderr' : 'stdio'));
                        }
                    }

                    if (this.enableDebugProtocol || (typeof commandResults.message !== 'string')) {
                        response.body = {
                            result: 'invalid',
                            variablesReference: 0
                        };
                    } else {
                        response.body = {
                            result: commandResults.message === '\r\n' ? 'invalid' : commandResults.message,
                            variablesReference: 0
                        };
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error during variables request', error);
            response.success = false;
            response.message = error?.message ?? error;
        }
        try {
            this.sendResponse(response);
        } catch { }
        deferred.resolve();
    }

    private async evaluateExpressionToTempVar(args: DebugProtocol.EvaluateArguments, variablePath: string[]): Promise<{ evalArgs: DebugProtocol.EvaluateArguments; variablePath: string[] }> {
        let returnVal = { evalArgs: args, variablePath };
        if (!variablePath && util.isAssignableExpression(args.expression)) {
            let varIndex = this.getNextVarIndex(args.frameId);
            let arrayVarName = this.tempVarPrefix + 'eval';
            let command = '';
            if (varIndex === 0) {
                await this.rokuAdapter.evaluate(`if type(${arrayVarName}) = "<uninitialized>" then ${arrayVarName} = []\n`, args.frameId);
            }
            let statement = `${arrayVarName}[${varIndex}] = ${args.expression}`;
            returnVal.evalArgs.expression = `${arrayVarName}[${varIndex}]`;
            command += statement;
            let commandResults = await this.rokuAdapter.evaluate(command, args.frameId);
            if (commandResults.type === 'error') {
                throw new Error(commandResults.message);
            }
            returnVal.variablePath = [arrayVarName, varIndex.toString()];
        }
        return returnVal;
    }

    private async bulkEvaluateExpressionToTempVar(frameId: number, argsArray: Array<DebugProtocol.EvaluateArguments>, variablePathArray: Array<string[]>): Promise<{ evaluations: Array<{ evalArgs: DebugProtocol.EvaluateArguments; variablePath: string[] }>; bulkVarName: string }> {
        let results = {
            evaluations: [],
            bulkVarName: ''
        };
        let storedVariables = [];
        let command = '';
        for (let i = 0; i < argsArray.length; i++) {
            let args = argsArray[i];
            let variablePath = variablePathArray[i];
            let returnVal = { evalArgs: args, variablePath };
            if (!variablePath && util.isAssignableExpression(args.expression)) {
                let varIndex = this.getNextVarIndex(frameId);
                let arrayVarName = this.tempVarPrefix + 'eval';
                if (varIndex === 0) {
                    command += `if type(${arrayVarName}) = "<uninitialized>" then ${arrayVarName} = []\n`;
                }
                let statement = `${arrayVarName}[${varIndex}] = ${args.expression}\n`;
                returnVal.evalArgs.expression = `${arrayVarName}[${varIndex}]`;
                command += statement;

                storedVariables.push(`${arrayVarName}[${varIndex}]`);
                returnVal.variablePath = [arrayVarName, varIndex.toString()];
            }

            results.evaluations[i] = returnVal;
        }

        if (command) {

            // create a bulk container for the command results
            let varIndex = this.getNextVarIndex(frameId);
            let arrayVarName = this.tempVarPrefix + 'eval';
            let bulkContainerStatement = `${arrayVarName}[${varIndex}] = [\n`;
            for (let storedVariable of storedVariables) {
                bulkContainerStatement += `${storedVariable},\n`;
            }
            bulkContainerStatement += `]`;

            command += bulkContainerStatement;

            results.bulkVarName = `${arrayVarName}[${varIndex}]`;

            let commandResults = await this.rokuAdapter.evaluate(command, frameId);
            if (commandResults.type === 'error') {
                throw new Error(commandResults.message);
            }
        }

        return results;
    }

    protected async completionsRequest(response: DebugProtocol.CompletionsResponse, args: DebugProtocol.CompletionsArguments, request?: DebugProtocol.Request) {
        this.logger.log('completionsRequest', args, request);
        // this.sendEvent(new LogOutputEvent(`completionsRequest: ${args.text}`));
        // this.sendEvent(new OutputEvent(`completionsRequest: ${args.text}\n`, 'stderr'));

        try {
            let supplyLocalScopeCompletions = false;

            let closestCompletionDetails = this.getClosestCompletionDetails(args);

            if (!closestCompletionDetails) {
                // If the cursor is not at the end of the line, then we should not supply completions at this time
                response.body = {
                    targets: []
                };
                return this.sendResponse(response);
            }
            let completions = new Map<string, DebugProtocol.CompletionItem>();

            let parentVariablePath = closestCompletionDetails.parentVariablePath;
            // Get the completions if the variable path was valid
            if (parentVariablePath) {

                // If the parent variable path is an empty string, then we are looking up the local scope variables and global functions
                if (parentVariablePath.length === 1 && parentVariablePath[0] === '') {
                    supplyLocalScopeCompletions = true;
                }

                // Look up the parent variable
                let parentVariable = this.findVariableByPath(Object.values(this.variables), parentVariablePath, args.frameId);

                if (!parentVariable || parentVariable.childVariables.length === 0) {
                    // We did not find the parent variable, so try to look it up from the device
                    try {
                        let { evalArgs } = await this.evaluateExpressionToTempVar({ expression: parentVariablePath.join('.'), frameId: args.frameId }, parentVariablePath);
                        let result = await this.rokuAdapter.getVariable(evalArgs.expression, args.frameId);
                        parentVariable = await this.getVariableFromResult(result, args.frameId);
                    } catch (error) {
                        this.logger.error('Error looking up parent completions', error, { parentVariablePath });
                    }
                }

                // provide completions for the parent variable if one was found
                if (parentVariable) {
                    let possibleFieldsAndMethods: AugmentedVariable[] = [];
                    // Filter out virtual variables
                    possibleFieldsAndMethods = parentVariable.childVariables.filter((v) => v.presentationHint?.kind !== 'virtual');

                    for (let v of possibleFieldsAndMethods) {
                        // Default completion type should be variable
                        let completionType: DebugProtocol.CompletionItemType = 'variable';
                        if (!supplyLocalScopeCompletions) {
                            // We are not supplying local scope completions, so we need to determine the completion type relative to the parent variable
                            if (parentVariable.type === 'roSGNode' || parentVariable.type === VariableType.AssociativeArray || parentVariable.type === VariableType.Object) {
                                completionType = 'field';
                            }

                            switch (v.type) {
                                case VariableType.Function:
                                case VariableType.Subroutine:
                                    completionType = 'method';
                                    break;
                                default:
                                    break;
                            }
                        }

                        let label = v.name;
                        if (parentVariable.type === VariableType.Array ||
                            parentVariable.type === VariableType.List ||
                            parentVariable.type === 'roXMLList' ||
                            parentVariable.type === 'roByteArray'
                        ) {
                            label = `[${v.name}]`;
                        }
                        completions.set(`${completionType}-${v.name}`, {
                            label: label,
                            type: completionType,
                            sortText: '000000'
                        });
                    }

                    let parentComponentType = this.debuggerVarTypeToRoType(parentVariable.type).toLowerCase();
                    //assemble a list of all methods on the parent component
                    const methods = [
                        //if the parent variable is an actual interface (if applicable) Ex: `ifString` or `ifArray`
                        ...interfaces[parentComponentType as 'ifappinfo']?.methods ?? [],
                        //interfaces from component of this name (if applicable) Ex: `roSGNode` or `roDateTime`
                        ...components[parentComponentType as 'roappinfo']?.interfaces.map((i) => interfaces[i.name.toLowerCase() as 'ifappinfo']?.methods) ?? [],
                        // Add parent event function completions (if applicable) Ex: `roSGNodeEvent` or `roDeviceInfoEvent`
                        ...events[parentComponentType as 'roappmemorymonitorevent']?.methods ?? []
                    ].flat();

                    // Based on the results of interface, component, and event looks up, add all the methods to the completions
                    for (const method of methods) {
                        completions.set(`method-${method.name}`, {
                            label: method.name,
                            type: 'method',
                            detail: method.description ?? '',
                            sortText: '000000'
                        });
                    }

                    // Add the global functions to the completions results
                    if (supplyLocalScopeCompletions) {
                        for (let globalCallable of globalCallables) {
                            completions.set(`function-${globalCallable.name.toLocaleLowerCase()}`, {
                                label: globalCallable.name,
                                type: 'function',
                                detail: globalCallable.shortDescription ?? globalCallable.documentation ?? '',
                                sortText: '000000'
                            });
                        }

                        const frame = this.rokuAdapter.getStackFrameById(args.frameId);

                        try {
                            let scopeFunctions = await this.projectManager.getScopeFunctionsForFile(frame.filePath as string);
                            for (let scopeFunction of scopeFunctions) {
                                if (!completions.has(`${scopeFunction.completionItemKind}-${scopeFunction.name.toLocaleLowerCase()}`)) {
                                    completions.set(`${scopeFunction.completionItemKind}-${scopeFunction.name.toLocaleLowerCase()}`, {
                                        label: scopeFunction.name,
                                        type: scopeFunction.completionItemKind,
                                        sortText: '000000'
                                    });
                                }
                            }
                        } catch (e) {
                            this.logger.warn('Could not build list of scope functions for file', e);
                        }
                    }
                }
            }

            // this.sendEvent(new LogOutputEvent(`text: ${args.text} | completions: ${completions.map(v => v.label).join(', ')}`));
            // this.sendEvent(new OutputEvent(`text: ${args.text} | completions: ${completions.map(v => v.label).join(', ')}\n`, 'stderr'));

            response.body = {
                targets: [...completions.values()]
            };
        } catch (error) {
            // this.sendEvent(new LogOutputEvent(`text: ${args.text} | ${error}`));
            // this.sendEvent(new OutputEvent(`text: ${args.text} | ${error}\n`, 'stderr'));
            this.logger.error('Error during completionsRequest', error, { args });
        }
        this.sendResponse(response);
    }

    /**
     * Gets the closest completion details the incoming completion request.
     */
    private getClosestCompletionDetails(args: DebugProtocol.CompletionsArguments): { parentVariablePath: string[] } {
        const incomingText = args.text;
        const lines = incomingText.split('\n');
        let lineNumber = this.toDebuggerLine(args.line, 0);
        let column = this.toDebuggerColumn(args.column);

        const targetLine = lines[lineNumber];
        let variablePathString = '';

        let i = column - 1;
        const variableChars = /[a-z0-9_\.]/i;

        // If the character at immediate to the right of the cursor is a variable character, then we are not at the end of the variable path.
        if (targetLine.length - 1 > i && variableChars.test(targetLine[i + 1])) {
            return undefined;
        }

        // Find the start of the variable path by looking for the first non-alphanumeric or non_underscore character before the cursor
        while (i >= 0 && (variableChars.test(targetLine[i]))) {
            i--;
        }

        // Pull the variable path string from the line
        variablePathString = targetLine.slice(i + 1, column);

        // Attempted dot access something unexpected
        // Example: `getPerson().name` where `getPerson()` is not a valid variable
        // and results in `.name` being the variable path string
        if (variablePathString.startsWith('.')) {
            return undefined;
        }

        // Get the variable path from the text
        let variablePath: string[] = [];
        if (!variablePathString.trim()) {
            // The text was empty so assume via '' that we are looking up the local scope variables and global functions
            variablePath = [''];
        } else if (variablePathString.endsWith('.')) {
            // supplied text ends with a period, so strip it off to create a valid variable path
            variablePath = util.getVariablePath(variablePathString.slice(0, -1));
        } else {
            variablePath = util.getVariablePath(variablePathString);
        }

        // the target string is not a valid variable path
        if (!variablePath) {
            return undefined;
        }

        let parentVariablePath: string[];
        // If the last character is a period, then pull completions for the parent variable before the period
        if (variablePathString.endsWith('.')) {
            parentVariablePath = variablePath;
        } else {
            // Otherwise, pull completions for the parent variable
            parentVariablePath = variablePath.slice(0, variablePath.length - 1);
        }

        // If the parent variable path is empty or an empty string, then we are looking up the local scope variables and global functions
        if (parentVariablePath.length === 0) {
            parentVariablePath = [''];
        }

        return { parentVariablePath: parentVariablePath };
    }

    private findVariableByPath(variables: AugmentedVariable[], path: string[], frameId: number) {
        let current: AugmentedVariable = null;
        for (const name of path) {
            // Find the object matching the current name in the data
            current = (Array.isArray(variables) ? variables : current?.childVariables)?.find(obj => {
                return obj.name === name && obj.frameId === frameId;
            });

            // If no match is found, return null
            if (!current) {
                return null;
            }

            // Move to the children for the next iteration
            variables = current.childVariables;
        }
        return current;
    }

    private debuggerVarTypeToRoType(type: string): string {
        switch (type) {
            case VariableType.Function:
            case VariableType.Subroutine:
                return 'roFunction';
            case VariableType.AssociativeArray:
                return 'roAssociativeArray';
            case VariableType.List:
                return 'roList';
            case VariableType.Array:
                return 'roArray';
            case VariableType.Boolean:
                return 'roBoolean';
            case VariableType.Double:
                return 'roDouble';
            case VariableType.Float:
                return 'roFloat';
            case VariableType.Integer:
                return 'roInteger';
            case VariableType.LongInteger:
                return 'roLongInteger';
            case VariableType.String:
                return 'roString';
            default:
                return type;
        }
    }

    /**
     * Called when the host stops debugging
     * @param response
     * @param args
     */
    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request) {
        //return to the home screen
        if (!this.enableDebugProtocol) {
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
        }
        this.sendResponse(response);
        await this.shutdown();
    }

    private createRokuAdapter(rendezvousTracker: RendezvousTracker) {
        if (this.enableDebugProtocol) {
            this.rokuAdapter = new DebugProtocolAdapter(this.launchConfiguration, this.projectManager, this.breakpointManager, rendezvousTracker, this.deviceInfo);
        } else {
            this.rokuAdapter = new TelnetAdapter(this.launchConfiguration, rendezvousTracker);
        }
    }

    protected async restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments, request?: DebugProtocol.Request) {
        this.logger.log('[restartRequest] begin');
        if (this.rokuAdapter) {
            if (!this.enableDebugProtocol) {
                this.rokuAdapter.removeAllListeners();
            }
            await this.rokuAdapter.destroy();
            await this.ensureAppIsInactive();
            this.rokuAdapterDeferred = defer();
        }
        await this.launchRequest(response, args.arguments as LaunchConfiguration);
    }

    private exitAppTimeout = 5000;
    private async ensureAppIsInactive() {
        const startTime = Date.now();

        while (true) {
            if (Date.now() - startTime > this.exitAppTimeout) {
                return;
            }

            try {
                let appStateResult = await rokuECP.getAppState({
                    host: this.launchConfiguration.host,
                    remotePort: this.launchConfiguration.remotePort,
                    appId: 'dev',
                    requestOptions: { timeout: 300 }
                });

                const state = appStateResult.state;

                if (state === AppState.active || state === AppState.background) {
                    // Suspends or terminates an app that is running:
                    // If the app supports Instant Resume and is running in the foreground, sending this command suspends the app (the app runs in the background).
                    // If the app supports Instant Resume and is running in the background or the app does not support Instant Resume and is running, sending this command terminates the app.
                    // This means that we might need to send this command twice to terminate the app.
                    await rokuECP.exitApp({
                        host: this.launchConfiguration.host,
                        remotePort: this.launchConfiguration.remotePort,
                        appId: 'dev',
                        requestOptions: { timeout: 300 }
                    });
                } else if (state === AppState.inactive) {
                    return;
                }
            } catch (e) {
                this.logger.error('Error attempting to exit application', e);
            }

            await util.sleep(200);
        }
    }

    /**
     * Used to track whether the entry breakpoint has already been handled
     */
    private entryBreakpointWasHandled = false;

    /**
     * Registers the main events for the RokuAdapter
     */
    private async connectRokuAdapter() {
        this.rokuAdapter.on('start', () => {
            if (!this.firstRunDeferred.isCompleted) {
                this.firstRunDeferred.resolve();
            }
        });

        //when the debugger suspends (pauses for debugger input)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.rokuAdapter.on('suspend', async () => {
            await this.onSuspend();
        });

        //anytime the adapter encounters an exception on the roku,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.rokuAdapter.on('runtime-error', async (exception) => {
            await this.getRokuAdapter();
            const threads = await this.setupSuspendedState();
            let threadId = threads[0]?.threadId;
            this.sendEvent(new StoppedEvent(StoppedEventReason.exception, threadId, exception.message));
        });

        // If the roku says it can't continue, we are no longer able to debug, so kill the debug session
        this.rokuAdapter.on('cannot-continue', () => {
            void this.shutdown();
        });

        //make the connection
        await this.rokuAdapter.connect();
        this.rokuAdapterDeferred.resolve(this.rokuAdapter);
        return this.rokuAdapter;
    }

    private async onSuspend() {
        const threads = await this.setupSuspendedState();
        const activeThread = threads.find(x => x.isSelected);

        //if !stopOnEntry, and we haven't encountered a suspend yet, THIS is the entry breakpoint. auto-continue
        if (!this.entryBreakpointWasHandled && !this.launchConfiguration.stopOnEntry) {
            this.entryBreakpointWasHandled = true;
            //if there's a user-defined breakpoint at this exact position, it needs to be handled like a regular breakpoint (i.e. suspend). So only auto-continue if there's no breakpoint here
            if (activeThread && !await this.breakpointManager.lineHasBreakpoint(this.projectManager.getAllProjects(), activeThread.filePath, activeThread.lineNumber - 1)) {
                this.logger.info('Encountered entry breakpoint and `stopOnEntry` is disabled. Continuing...');
                return this.rokuAdapter.continue();
            }
        }

        const event: StoppedEvent = new StoppedEvent(
            StoppedEventReason.breakpoint,
            //Not sure why, but sometimes there is no active thread. Just pick thread 0 to prevent the app from totally crashing
            activeThread?.threadId ?? 0,
            '' //exception text
        );
        // Socket debugger will always stop all threads and supports multi thread inspection.
        (event.body as any).allThreadsStopped = this.enableDebugProtocol;
        this.sendEvent(event);
    }

    private async setupSuspendedState() {
        //clear the index for storing evalutated expressions
        this.evaluateVarIndexByFrameId.clear();

        const threads = await this.rokuAdapter.getThreads();

        //TODO remove this once Roku fixes their threads off-by-one line number issues
        //look up the correct line numbers for each thread from the StackTrace
        await Promise.all(
            threads.map(async (thread) => {
                const stackTrace = await this.rokuAdapter.getStackTrace(thread.threadId);
                const stackTraceLineNumber = stackTrace[0]?.lineNumber;
                if (stackTraceLineNumber !== thread.lineNumber) {
                    this.logger.warn(`Thread ${thread.threadId} reported incorrect line (${thread.lineNumber}). Using line from stack trace instead (${stackTraceLineNumber})`, thread, stackTrace);
                    thread.lineNumber = stackTraceLineNumber;
                }
            })
        );

        outer: for (const bp of this.breakpointManager.failedDeletions) {
            for (const thread of threads) {
                let sourceLocation = await this.projectManager.getSourceLocation(thread.filePath, thread.lineNumber);
                // This stop was due to a breakpoint that we tried to delete, but couldn't.
                // Now that we are stopped, we can delete it. We won't stop here again unless you re-add the breakpoint. You're welcome.
                if ((bp.srcPath === sourceLocation.filePath) && (bp.line === sourceLocation.lineNumber)) {
                    this.showPopupMessage(`Stopped at breakpoint that failed to delete. Deleting now, and should not cause future stops.`, 'info').catch((error) => {
                        this.logger.error('Error showing popup message', { error });
                    });
                    this.logger.warn(`Stopped at breakpoint that failed to delete. Deleting now, and should not cause future stops`, bp, thread, sourceLocation);
                    break outer;
                }
            }
        }

        //sync breakpoints
        await this.rokuAdapter?.syncBreakpoints();

        this.logger.info('received "suspend" event from adapter');

        this.clearState();
        return threads;
    }

    private async getVariableFromResult(result: EvaluateContainer, frameId: number, maxDepth = 1) {
        let v: AugmentedVariable;

        if (result) {
            if (this.rokuAdapter.isDebugProtocolAdapter()) {
                let refId = this.getEvaluateRefId(result.evaluateName, frameId);
                if (result.isCustom && !result.presentationHint?.lazy && result.evaluateNow) {
                    try {
                        // We should not wait to resolve this variable later. Fetch, store, and merge the results right away.
                        let { evalArgs } = await this.evaluateExpressionToTempVar({ expression: result.evaluateName, frameId: frameId }, util.getVariablePath(result.evaluateName));
                        let newResult = await this.rokuAdapter.getVariable(evalArgs.expression, frameId);
                        this.mergeEvaluateContainers(result, newResult);
                    } catch (error) {
                        logger.error('Error getting variables', error);
                        this.mergeEvaluateContainers(result, {
                            name: result.name,
                            evaluateName: result.evaluateName,
                            children: [],
                            value: `❌ Error: ${error.message}`,
                            type: '',
                            highLevelType: undefined,
                            keyType: undefined
                        });
                    }
                }

                if (result.keyType) {
                    let value = `${result.value ?? result.type}`;
                    let indexedVariables = result.indexedVariables;
                    let namedVariables = result.namedVariables;

                    if (indexedVariables === undefined || namedVariables === undefined) {
                        // If either indexed or named variables are undefined, we should tell the debugger to ask for everything
                        // by supplying undefined values for both
                        indexedVariables = undefined;
                        namedVariables = undefined;
                    }

                    // check to see if this is an dictionary or a list
                    if (result.keyType === 'Integer') {
                        // list type
                        v = new Variable(result.name, value, refId, indexedVariables as number, namedVariables as number);
                    } else if (result.keyType === 'String') {
                        // dictionary type
                        v = new Variable(result.name, value, refId, indexedVariables as number, namedVariables as number);
                    }
                    v.type = result.type;
                } else {

                    let value: string;
                    if (result.type === VariableType.Invalid) {
                        value = result.value ?? 'Invalid';
                    } else if (result.type === VariableType.Uninitialized) {
                        value = 'Uninitialized';
                    } else {
                        value = `${result.value}`;
                    }
                    // If the variable is lazy we must assign a refId to inform the system
                    // to request this variable again in the future for value resolution
                    v = new Variable(result.name, value, result?.presentationHint?.lazy ? refId : 0);
                }
                this.variables[refId] = v;
            } else if (this.rokuAdapter.isTelnetAdapter()) {
                if (result.highLevelType === 'primative' || result.highLevelType === 'uninitialized') {
                    v = new Variable(result.name, `${result.value}`);
                } else if (result.highLevelType === 'array') {
                    let refId = this.getEvaluateRefId(result.evaluateName, frameId);
                    v = new Variable(result.name, result.type, refId, result.children?.length ?? 0, 0);
                    this.variables[refId] = v;
                } else if (result.highLevelType === 'object') {
                    let refId: number;
                    //handle collections
                    if (this.rokuAdapter.isScrapableContainObject(result.type)) {
                        refId = this.getEvaluateRefId(result.evaluateName, frameId);
                    }
                    v = new Variable(result.name, result.type, refId, 0, result.children?.length ?? 0);
                    this.variables[refId] = v;
                } else if (result.highLevelType === 'function') {
                    v = new Variable(result.name, `${result.value}`);
                } else {
                    //all other cases, but mostly for HighLevelType.unknown
                    v = new Variable(result.name, `${result.value}`);
                }
            }

            v.type = result.type;
            v.evaluateName = result.evaluateName;
            v.frameId = frameId;
            v.type = result.type;
            v.presentationHint = result.presentationHint ? { kind: result.presentationHint?.kind, lazy: result.presentationHint?.lazy } : undefined;
            if (util.isTransientVariable(v.name)) {
                v.presentationHint = { kind: 'virtual' };
            }

            if (result.children && maxDepth > 0) {
                if (!v.childVariables) {
                    v.childVariables = [];
                }

                // Create a mapping of the children to their index so we can evaluate them in bulk
                let indexMappedChildren = result.children.map((child, index) => {
                    let remapped = { child: child, index: index, evaluate: !!(child.isCustom && !child.presentationHint?.lazy && child.evaluateNow) };
                    return remapped;
                });
                if (this.enableDebugProtocol) {
                    let childrenToEvaluate = indexMappedChildren.filter(x => x.evaluate);
                    let evaluateArgsArray = childrenToEvaluate.map(x => {
                        return { expression: x.child.evaluateName, frameId: frameId };
                    });

                    let variablePathArray = childrenToEvaluate.map(x => {
                        return util.getVariablePath(x.child.evaluateName);
                    });

                    try {
                        let bulkEvaluations = await this.bulkEvaluateExpressionToTempVar(frameId, evaluateArgsArray, variablePathArray);
                        if (bulkEvaluations.bulkVarName) {
                            let newResults = await this.rokuAdapter.getVariable(bulkEvaluations.bulkVarName, frameId);
                            childrenToEvaluate.map((mappedChild, index) => {
                                let newResult = newResults.children[index];
                                this.mergeEvaluateContainers(mappedChild.child, newResult);
                                mappedChild.child.evaluateNow = false;
                                return mappedChild;
                            });
                        }
                    } catch (error) {
                        this.logger.error('Error getting bulk variables, will fall back to var by var lookups', error);
                    }
                }
                // If bulk evaluations failed, there is fall back logic in `getVariableFromResult` to do individual evaluations
                v.childVariables = await Promise.all(indexMappedChildren.map(async (mappedChild) => {
                    return this.getVariableFromResult(mappedChild.child, frameId, maxDepth - 1);
                }));
            } else {
                v.childVariables = [];
            }

            // if the var is an array and debugProtocol is enabled, include the array size
            if (this.enableDebugProtocol && v.type === VariableType.Array) {
                if (isNaN(result.indexedVariables as number)) {
                    v.value = v.type;
                } else {
                    v.value = `${v.type}(${result.indexedVariables})`;
                }
            }
        }
        return v;
    }

    /**
     * Helper function to merge the results of an evaluate call into an existing EvaluateContainer
     * Used primarily for custom variables
     */
    private mergeEvaluateContainers(original: EvaluateContainer, updated: EvaluateContainer) {
        original.children = updated.children;
        original.value = updated.value;
        original.type = updated.type;
        original.highLevelType = updated.highLevelType;
        original.keyType = updated.keyType;
        original.indexedVariables = updated.indexedVariables;
        original.namedVariables = updated.namedVariables;
    }

    private getEvaluateRefId(expression: string, frameId: number) {
        let evaluateRefId = `${expression}-${frameId}`;
        if (!this.evaluateRefIdLookup[evaluateRefId]) {
            this.evaluateRefIdLookup[evaluateRefId] = this.evaluateRefIdCounter++;
        }
        return this.evaluateRefIdLookup[evaluateRefId];
    }

    private clearState() {
        //erase all cached variables
        this.variables = {};
    }

    /**
     * Tells the client to re-request all variables because we've invalidated them
     * @param threadId
     * @param stackFrameId
     */
    private sendInvalidatedEvent(threadId?: number, stackFrameId?: number) {
        //if the client supports this request, send it
        if (this.initRequestArgs.supportsInvalidatedEvent) {
            this.sendEvent(new InvalidatedEvent(['variables'], threadId, stackFrameId));
        }
    }

    /**
     * If `stopOnEntry` is enabled, register the entry breakpoint.
     */
    public async handleEntryBreakpoint() {
        if (!this.enableDebugProtocol) {
            this.entryBreakpointWasHandled = true;
            if (this.launchConfiguration.stopOnEntry || this.launchConfiguration.deepLinkUrl) {
                await this.projectManager.registerEntryBreakpoint(this.projectManager.mainProject.stagingDir);
            }
        }
    }

    /**
     * Converts a debugger line number to a client line number.
     *
     * @param debuggerLine - The line number from the debugger as zero based.
     * @param defaultDebuggerLine - An optional default line number, as zero based, to use if `debuggerLine` is not provided.
     * @returns The corresponding client line number.
     */
    private toClientLine(debuggerLine: number, defaultDebuggerLine?: number) {
        return this.convertDebuggerLineToClient(debuggerLine ?? defaultDebuggerLine);
    }

    /**
     * Converts a debugger column number to a client column number.
     *
     * @param debuggerLine - The column number from the debugger as zero based.
     * @param defaultDebuggerLine - An optional default column number, as zero based, to use if `debuggerLine` is not provided.
     * @returns The corresponding client column number.
     */
    private toClientColumn(debuggerLine: number, defaultDebuggerLine?: number) {
        return this.convertDebuggerColumnToClient(debuggerLine ?? defaultDebuggerLine);
    }

    /**
     * Converts a client line number to a debugger line number.
     *
     * @param clientLine - The line number from the client.
     * @param defaultDebuggerLine - An optional default line number, as zero based, to use if `clientLine` is not provided.
     * @returns The corresponding debugger line number as zero based.
     */
    private toDebuggerLine(clientLine: number, defaultDebuggerLine?: number) {
        if (typeof clientLine === 'number') {
            return this.convertClientLineToDebugger(clientLine);
        }
        return defaultDebuggerLine;
    }

    /**
     * Converts a client column number to a debugger column number.
     *
     * @param clientLine - The column number from the client.
     * @param defaultDebuggerLine - An optional default column number, as zero based, to use if `clientLine` is not provided.
     * @returns The corresponding debugger column number as zero based.
     */
    private toDebuggerColumn(clientLine: number, defaultDebuggerLine?: number) {
        if (typeof clientLine === 'number') {
            return this.convertClientColumnToDebugger(clientLine);
        }
        return defaultDebuggerLine;
    }

    private shutdownPromise: Promise<void> | undefined = undefined;

    /**
     * Called when the debugger is terminated. Feel free to call this as frequently as you want; we'll only run the shutdown process the first time, and return
     * the same promise on subsequent calls
     */
    public async shutdown(errorMessage?: string, modal = false): Promise<void> {
        if (this.shutdownPromise === undefined) {
            this.logger.log('[shutdown] Beginning shutdown sequence', errorMessage);
            this.shutdownPromise = this._shutdown(errorMessage, modal);
        } else {
            this.logger.log('[shutdown] Tried to call `.shutdown()` again. Returning the same promise');
        }
        return this.shutdownPromise;
    }

    private async _shutdown(errorMessage?: string, modal = false): Promise<void> {
        //send the message FIRST before anything else. This improves the chances that the message will be displayed to the user
        try {
            if (errorMessage) {
                this.logger.error(errorMessage);
                this.showPopupMessage(errorMessage, 'error', modal).catch((error) => {
                    this.logger.error('Error showing popup message', { error });
                });
            }
        } catch (e) {
            this.logger.error(e);
        }

        //close the debugger connection
        try {
            this.logger.log('Destroy rokuAdapter');
            await this.rokuAdapter?.destroy?.();
            //press the home button to return to the home screen
            try {
                this.logger.log('Press home button');
                await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
            } catch (e) {
                this.logger.error(e);
            }
        } catch (e) {
            this.logger.error(e);
        }

        try {
            this.projectManager?.dispose?.();
        } catch (e) {
            this.logger.error(e);
        }

        try {
            this.componentLibraryServer?.stop();
        } catch (e) {
            this.logger.error(e);
        }

        try {
            await this.rendezvousTracker?.destroy?.();
        } catch (e) {
            this.logger.error(e);
        }

        try {
            await this.sourceMapManager?.destroy?.();
        } catch (e) {
            this.logger.error(e);
        }

        try {
            //if configured, delete the staging directory
            if (!this.launchConfiguration.retainStagingFolder) {
                const stagingDirs = this.projectManager?.getStagingDirs() ?? [];
                this.logger.info('deleting staging folders', stagingDirs);
                for (let stagingDir of stagingDirs) {
                    try {
                        fsExtra.removeSync(stagingDir);
                    } catch (e) {
                        this.logger.error(e);
                        util.log(`Error removing staging directory '${stagingDir}': ${JSON.stringify(e)}`);
                    }
                }
            }
        } catch (e) {
            this.logger.error(e);
        }

        try {
            this.logger.log('Send terminated event');
            this.sendEvent(new TerminatedEvent());

            //shut down the process
            this.logger.log('super.shutdown()');
            super.shutdown();
            this.logger.log('shutdown complete');
        } catch (e) {
            this.logger.error(e);
        }
    }
}

export interface AugmentedVariable extends DebugProtocol.Variable {
    childVariables?: AugmentedVariable[];
    // eslint-disable-next-line camelcase
    request_seq?: number;
    frameId?: number;
    /**
     * only used for lazy variables
     */
    isResolved?: boolean;
    /**
     * used to indicate that this variable is a scope variable
     * and may require special handling
     */
    isScope?: boolean;
}
