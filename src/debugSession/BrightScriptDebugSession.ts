import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import * as path from 'path';
import * as request from 'request';
import { rokuDeploy } from 'roku-deploy';
import { CompileError } from 'roku-deploy/dist/Errors';
import type { RokuDeploy, RokuDeployOptions } from 'roku-deploy';
import {
    BreakpointEvent,
    DebugSession as BaseDebugSession,
    Handles,
    InitializedEvent,
    InvalidatedEvent,
    OutputEvent,
    Scope,
    Source,
    StackFrame,
    StoppedEvent,
    TerminatedEvent,
    Thread,
    Variable
} from 'vscode-debugadapter';
import type { SceneGraphCommandResponse } from '../SceneGraphDebugCommandController';
import { SceneGraphDebugCommandController } from '../SceneGraphDebugCommandController';
import type { DebugProtocol } from 'vscode-debugprotocol';
import { defer, util } from '../util';
import { fileUtils, standardizePath as s } from '../FileUtils';
import { ComponentLibraryServer } from '../ComponentLibraryServer';
import { ProjectManager, Project, ComponentLibraryProject } from '../managers/ProjectManager';
import type { EvaluateContainer } from '../adapters/DebugProtocolAdapter';
import { DebugProtocolAdapter } from '../adapters/DebugProtocolAdapter';
import { TelnetAdapter } from '../adapters/TelnetAdapter';
import type { BSDebugDiagnostic } from '../CompileErrorProcessor';
import {
    LaunchStartEvent,
    LogOutputEvent,
    RendezvousEvent,
    DiagnosticsEvent,
    StoppedEventReason,
    ChanperfEvent,
    DebugServerLogOutputEvent,
    ChannelPublishedEvent,
    PopupMessageEvent
} from './Events';
import type { LaunchConfiguration, ComponentLibraryConfiguration } from '../LaunchConfiguration';
import { FileManager } from '../managers/FileManager';
import { SourceMapManager } from '../managers/SourceMapManager';
import { LocationManager } from '../managers/LocationManager';
import type { AugmentedSourceBreakpoint } from '../managers/BreakpointManager';
import { BreakpointManager } from '../managers/BreakpointManager';
import type { LogMessage } from '../logging';
import { logger, debugServerLogOutputEventTransport } from '../logging';
import { waitForDebugger } from 'inspector';

export class BrightScriptDebugSession extends BaseDebugSession {
    public constructor() {
        super();

        // this debugger uses one-based lines and columns
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);

        //give util a reference to this session to assist in logging across the entire module
        util._debugSession = this;
        this.fileManager = new FileManager();
        this.sourceMapManager = new SourceMapManager();
        this.locationManager = new LocationManager(this.sourceMapManager);
        this.breakpointManager = new BreakpointManager(this.sourceMapManager, this.locationManager);
        //send newly-verified breakpoints to vscode
        this.breakpointManager.on('breakpoints-verified', (data) => this.onDeviceVerifiedBreakpoints(data));
        this.projectManager = new ProjectManager(this.breakpointManager, this.locationManager);
    }

    private onDeviceVerifiedBreakpoints(data: { breakpoints: AugmentedSourceBreakpoint[] }) {
        this.logger.info('Sending verified device breakpoints to client', data);
        //send all verified breakpoints to the client
        for (const breakpoint of data.breakpoints) {
            const event: DebugProtocol.Breakpoint = {
                line: breakpoint.line,
                column: breakpoint.column,
                verified: true,
                id: breakpoint.id,
                source: {
                    path: breakpoint.srcPath
                }
            };
            this.sendEvent(new BreakpointEvent('changed', event));
        }
    }

    public logger = logger.createLogger(`[${BrightScriptDebugSession.name}]`);

    /**
     * A sequence used to help identify log statements for requests
     */
    private idCounter = 1;

    public fileManager: FileManager;

    public projectManager: ProjectManager;

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

    private variableHandles = new Handles<string>();

    private rokuAdapter: DebugProtocolAdapter | TelnetAdapter;
    private get enableDebugProtocol() {
        return this.launchConfiguration.enableDebugProtocol;
    }

    private getRokuAdapter() {
        return this.rokuAdapterDeferred.promise;
    }

    private launchConfiguration: LaunchConfiguration;
    private initRequestArgs: DebugProtocol.InitializeRequestArguments;

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    public initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        this.initRequestArgs = args;
        this.logger.log('initializeRequest');
        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());

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

        // This debug adapter supports breakpoints that break execution after a specified number of hits
        response.body.supportsHitConditionalBreakpoints = true;

        // This debug adapter supports log points by interpreting the 'logMessage' attribute of the SourceBreakpoint
        response.body.supportsLogPoints = true;

        this.sendResponse(response);

        //register the debug output log transport writer
        debugServerLogOutputEventTransport.setWriter((message: LogMessage) => {
            this.sendEvent(
                new DebugServerLogOutputEvent(
                    message.logger.formatMessage(message, false)
                )
            );
        });
        this.logger.log('initializeRequest finished');
    }

    private showPopupMessage(message: string, severity: 'error' | 'warn' | 'info') {
        this.sendEvent(new PopupMessageEvent(message, severity));
    }

    public async launchRequest(response: DebugProtocol.LaunchResponse, config: LaunchConfiguration) {
        this.logger.log('[launchRequest] begin');
        this.launchConfiguration = config;

        //set the logLevel provided by the launch config
        if (this.launchConfiguration.logLevel) {
            logger.logLevel = this.launchConfiguration.logLevel;
        }

        //do a DNS lookup for the host to fix issues with roku rejecting ECP
        try {
            this.launchConfiguration.host = await util.dnsLookup(this.launchConfiguration.host);
        } catch (e) {
            const errorMessage = `Could not resolve ip address for "${this.launchConfiguration.host}"`;
            this.showPopupMessage(errorMessage, 'error');
            throw e;
        }

        this.projectManager.launchConfiguration = this.launchConfiguration;
        this.breakpointManager.launchConfiguration = this.launchConfiguration;

        this.sendEvent(new LaunchStartEvent(this.launchConfiguration));

        let error: Error;
        this.logger.log('[launchRequest] Packaging and deploying to roku');
        try {
            const start = Date.now();
            //build the main project and all component libraries at the same time
            await Promise.all([
                this.prepareMainProject(),
                this.prepareAndHostComponentLibraries(this.launchConfiguration.componentLibraries, this.launchConfiguration.componentLibrariesPort)
            ]);
            this.logger.log(`Packaging projects took: ${(util.formatTime(Date.now() - start))}`);

            util.log(`Connecting to Roku via ${this.enableDebugProtocol ? 'the BrightScript debug protocol' : 'telnet'} at ${this.launchConfiguration.host}`);

            this.createRokuAdapter(this.launchConfiguration.host);
            if (!this.enableDebugProtocol) {
                //connect to the roku debug via telnet
                if (!this.rokuAdapter.connected) {
                    await this.connectRokuAdapter();
                }
            } else {
                await (this.rokuAdapter as DebugProtocolAdapter).watchCompileOutput();
            }

            await this.runAutomaticSceneGraphCommands(this.launchConfiguration.autoRunSgDebugCommands);

            //press the home button to ensure we're at the home screen
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);

            //pass the debug functions used to locate the client files and lines thought the adapter to the RendezvousTracker
            this.rokuAdapter.registerSourceLocator(async (debuggerPath: string, lineNumber: number) => {
                return this.projectManager.getSourceLocation(debuggerPath, lineNumber);
            });

            //pass the log level down thought the adapter to the RendezvousTracker and ChanperfTracker
            this.rokuAdapter.setConsoleOutput(this.launchConfiguration.consoleOutput);

            //pass along the console output
            if (this.launchConfiguration.consoleOutput === 'full') {
                this.rokuAdapter.on('console-output', (data) => {
                    this.sendLogOutput(data);
                });
            } else {
                this.rokuAdapter.on('unhandled-console-output', (data) => {
                    this.sendLogOutput(data);
                });
            }

            // Send chanperf events to the extension
            this.rokuAdapter.on('chanperf', (output) => {
                this.sendEvent(new ChanperfEvent(output));
            });

            // Send rendezvous events to the extension
            this.rokuAdapter.on('rendezvous', (output) => {
                this.sendEvent(new RendezvousEvent(output));
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
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.rokuAdapter.on('diagnostics', async (errors: BSDebugDiagnostic[]) => {
                // remove redundant errors and adjust the line number:
                // - Roku device and sourcemap work with 1-based line numbers,
                // - VS expects 0-based lines.
                const compileErrors = util.filterGenericErrors(errors);
                for (let compileError of compileErrors) {
                    let sourceLocation = await this.projectManager.getSourceLocation(compileError.path, compileError.range.start.line + 1);
                    if (sourceLocation) {
                        compileError.path = sourceLocation.filePath;
                        compileError.range.start.line = sourceLocation.lineNumber - 1; //sourceLocation is 1-based, but we need 0-based
                        compileError.range.end.line = sourceLocation.lineNumber - 1; //sourceLocation is 1-based, but we need 0-based
                    } else {
                        // TODO: may need to add a custom event if the source location could not be found by the ProjectManager
                        compileError.path = fileUtils.removeLeadingSlash(util.removeFileScheme(compileError.path));
                        compileError.range.start.line = (compileError.range.start.line || 1) - 1; // compile-error is 1-based, but we need 0-based
                        compileError.range.end.line = compileError.range.start.line; // compile-error is 1-based, but we need 0-based
                    }
                }

                this.sendEvent(new DiagnosticsEvent(compileErrors));
                //stop the roku adapter and exit the channel
                void this.rokuAdapter.destroy();
                void this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
            });

            // close disconnect if required when the app is exited
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.rokuAdapter.on('app-exit', async () => {
                if (this.launchConfiguration.stopDebuggerOnAppExit || !this.rokuAdapter.supportsMultipleRuns) {
                    let message = `App exit event detected${this.rokuAdapter.supportsMultipleRuns ? ' and launchConfiguration.stopDebuggerOnAppExit is true' : ''}`;
                    message += ' - shutting down debug session';

                    this.logger.log('on app-exit', message);
                    this.sendEvent(new LogOutputEvent(message));
                    if (this.rokuAdapter) {
                        void this.rokuAdapter.destroy();
                    }
                    //return to the home screen
                    await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
                    this.shutdown();
                    this.sendEvent(new TerminatedEvent());
                } else {
                    const message = 'App exit detected; but launchConfiguration.stopDebuggerOnAppExit is set to false, so keeping debug session running.';
                    this.logger.log('[launchRequest]', message);
                    this.sendEvent(new LogOutputEvent(message));
                }
            });

            //ignore the compile error failure from within the publish
            (this.launchConfiguration as any).failOnCompileError = false;
            // Set the remote debug flag on the args to be passed to roku deploy so the socket debugger can be started if needed.
            (this.launchConfiguration as any).remoteDebug = this.enableDebugProtocol;

            await this.connectAndPublish();

            this.sendEvent(new ChannelPublishedEvent(
                this.launchConfiguration
            ));

            //tell the adapter adapter that the channel has been launched.
            await this.rokuAdapter.activate();

            if (!error) {
                if (this.rokuAdapter.connected) {
                    this.logger.info('Host connection was established before the main public process was completed');
                    this.logger.log(`deployed to Roku@${this.launchConfiguration.host}`);
                    this.sendResponse(response);
                } else {
                    this.logger.info('Main public process was completed but we are still waiting for a connection to the host');
                    this.rokuAdapter.on('connected', (status) => {
                        if (status) {
                            this.logger.log(`deployed to Roku@${this.launchConfiguration.host}`);
                            this.sendResponse(response);
                        }
                    });
                }
            } else {
                throw error;
            }
        } catch (e) {
            //if the message is anything other than compile errors, we want to display the error
            if (!(e instanceof CompileError)) {
                util.log('Encountered an issue during the publish process');
                util.log((e as Error).message);
                this.sendErrorResponse(response, -1, (e as Error).message);
            }

            //send any compile errors to the client
            await this.rokuAdapter.sendErrors();
            this.logger.error('Error. Shutting down.', e);
            this.shutdown();
            return;
        }

        //at this point, the project has been deployed. If we need to use a deep link, launch it now.
        if (this.launchConfiguration.deepLinkUrl) {
            //wait until the first entry breakpoint has been hit
            await this.firstRunDeferred.promise;
            //if we are at a breakpoint, continue
            await this.rokuAdapter.continue();
            //kill the app on the roku
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
            //convert a hostname to an ip address
            const deepLinkUrl = await util.resolveUrl(this.launchConfiguration.deepLinkUrl);
            //send the deep link http request
            await new Promise((resolve, reject) => {
                request.post(deepLinkUrl, (err, response) => {
                    return err ? reject(err) : resolve(response);
                });
            });
        }
    }

    private async connectAndPublish() {
        let connectPromise: Promise<any>;
        //connect to the roku debug via sockets
        if (this.enableDebugProtocol) {
            connectPromise = this.connectRokuAdapter().catch(e => this.logger.error(e));
        }

        let packageIsPublished = false;
        //publish the package to the target Roku
        const publishPromise = this.rokuDeploy.publish({
            ...this.launchConfiguration,
            failOnCompileError: true
        } as any as RokuDeployOptions).then(() => {
            packageIsPublished = true;
        });

        await publishPromise;

        //the channel has been deployed. Wait for the adapter to finish connecting.
        //if it hasn't connected after 5 seconds, it probably will never connect.
        await Promise.race([
            connectPromise,
            util.sleep(5000)
        ]);
        this.logger.log('Finished racing promises');
        //if the adapter is still not connected, then it will probably never connect. Abort.
        if (packageIsPublished && !this.rokuAdapter.connected) {
            //kill the session cuz it won't ever come back
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
            const message = 'Debug session cancelled: failed to connect to debug protocol control port.';
            this.showPopupMessage(message, 'error');
            this.logger.error(message);
            this.shutdown();
            this.sendEvent(new TerminatedEvent());
        }
    }

    /**
     * Send log output to the "client" (i.e. vscode)
     * @param logOutput
     */
    private sendLogOutput(logOutput: string) {
        const lines = logOutput.split(/\r?\n/g);
        for (let line of lines) {
            line += '\n';
            this.sendEvent(new OutputEvent(line, 'stdout'));
            this.sendEvent(new LogOutputEvent(line));
        }
    }

    private async runAutomaticSceneGraphCommands(commands: string[]) {
        if (commands) {
            let connection = new SceneGraphDebugCommandController(this.launchConfiguration.host);

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
            stagingFolderPath: this.launchConfiguration.stagingFolderPath
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

        //create zip package from staging folder
        util.log('Creating zip archive from project sources');
        await this.projectManager.mainProject.zipPackage({ retainStagingFolder: true });
    }

    /**
     * Accepts custom events and requests from the extension
     * @param command name of the command to execute
     */
    protected customRequest(command: string) {
        if (command === 'rendezvous.clearHistory') {
            this.rokuAdapter.clearRendezvousHistory();
        }

        if (command === 'chanperf.clearHistory') {
            this.rokuAdapter.clearChanperfHistory();
        }
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

                this.projectManager.componentLibraryProjects.push(
                    new ComponentLibraryProject({
                        rootDir: componentLibrary.rootDir,
                        files: componentLibrary.files,
                        outDir: componentLibrariesOutDir,
                        outFile: componentLibrary.outFile,
                        sourceDirs: componentLibrary.sourceDirs,
                        bsConst: componentLibrary.bsConst,
                        injectRaleTrackerTask: componentLibrary.injectRaleTrackerTask,
                        raleTrackerTaskFileLocation: componentLibrary.raleTrackerTaskFileLocation,
                        libraryIndex: libraryIndex
                    })
                );
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
        //wait for the roku adapter to load
        await this.getRokuAdapter();

        let threads = [];

        //only send the threads request if we are at the debugger prompt
        if (this.rokuAdapter.isAtDebuggerPrompt) {
            let rokuThreads = await this.rokuAdapter.getThreads();

            for (let thread of rokuThreads) {
                threads.push(
                    new Thread(thread.threadId, `Thread ${thread.threadId}`)
                );
            }
        } else {
            this.logger.log('Skipped getting threads because the RokuAdapter is not accepting input at this time.');
        }

        response.body = {
            threads: threads
        };

        this.sendResponse(response);
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
        try {
            this.logger.log('stackTraceRequest');
            let frames = [];

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
            const scopes = new Array<Scope>();

            if (this.enableDebugProtocol) {
                let refId = this.getEvaluateRefId('', args.frameId);
                let v: AugmentedVariable;
                //if we already looked this item up, return it
                if (this.variables[refId]) {
                    v = this.variables[refId];
                } else {
                    let result = await this.rokuAdapter.getVariable('', args.frameId, true);
                    if (!result) {
                        throw new Error(`Could not get scopes`);
                    }
                    v = this.getVariableFromResult(result, args.frameId);
                    //TODO - testing something, remove later
                    // eslint-disable-next-line camelcase
                    v.request_seq = response.request_seq;
                    v.frameId = args.frameId;
                }

                let scope = new Scope('Local', refId, false);
                scopes.push(scope);
            } else {
                // NOTE: Legacy telnet support
                scopes.push(new Scope('Local', this.variableHandles.create('local'), false));
            }

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
        this.logger.log('continueRequest');
        await this.rokuAdapter.continue();
        this.sendResponse(response);
    }

    protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
        this.logger.log('pauseRequest');
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
        await this.rokuAdapter.stepInto(args.threadId);
        this.sendResponse(response);
        this.logger.info('[stepInRequest] end');
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
        this.logger.log('[stepOutRequest] begin');
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
        try {
            logger.log('begin', { args });

            let childVariables: AugmentedVariable[] = [];
            //wait for any `evaluate` commands to finish so we have a higher likely hood of being at a debugger prompt
            await this.evaluateRequestPromise;
            if (this.rokuAdapter.isAtDebuggerPrompt) {
                const reference = this.variableHandles.get(args.variablesReference);
                if (reference) {
                    logger.log('reference', reference);
                    // NOTE: Legacy telnet support for local vars
                    if (this.launchConfiguration.enableVariablesPanel) {
                        const vars = await (this.rokuAdapter as TelnetAdapter).getScopeVariables(reference);

                        for (const varName of vars) {
                            let result = await this.rokuAdapter.getVariable(varName, -1);
                            let tempVar = this.getVariableFromResult(result, -1);
                            childVariables.push(tempVar);
                        }
                    } else {
                        childVariables.push(new Variable('variables disabled by launch.json setting', 'enableVariablesPanel: false'));
                    }
                } else {
                    //find the variable with this reference
                    let v = this.variables[args.variablesReference];
                    logger.log('variable', v);
                    //query for child vars if we haven't done it yet.
                    if (v.childVariables.length === 0) {
                        let result = await this.rokuAdapter.getVariable(v.evaluateName, v.frameId);
                        let tempVar = this.getVariableFromResult(result, v.frameId);
                        tempVar.frameId = v.frameId;
                        v.childVariables = tempVar.childVariables;
                    }
                    childVariables = v.childVariables;
                }

                //if the variable is an array, send only the requested range
                if (Array.isArray(childVariables) && args.filter === 'indexed') {
                    //only send the variable range requested by the debugger
                    childVariables = childVariables.slice(args.start, args.start + args.count);
                }
                response.body = {
                    variables: childVariables
                };
            } else {
                logger.log('Skipped getting variables because the RokuAdapter is not accepting input at this time');
            }
            logger.info('end', { response });
            this.sendResponse(response);
        } catch (error) {
            logger.error('Error during variablesRequest', error, { args });
        }
    }

    private evaluateRequestPromise = Promise.resolve();

    public async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
        let deferred = defer<void>();
        if (args.context === 'repl' && !this.enableDebugProtocol && args.expression.trim().startsWith('>')) {
            this.clearState();
            const expression = args.expression.replace(/^\s*>\s*/, '');
            this.logger.log('Sending raw telnet command...I sure hope you know what you\'re doing', { expression });
            (this.rokuAdapter as TelnetAdapter).requestPipeline.client.write(`${expression}\r\n`);
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
            } else {
                const variablePath = util.getVariablePath(args.expression);
                //if we found a variable path (e.g. ['a', 'b', 'c']) then do a variable lookup because it's faster and more widely supported than `evaluate`
                if (variablePath) {
                    let refId = this.getEvaluateRefId(args.expression, args.frameId);
                    let v: AugmentedVariable;
                    //if we already looked this item up, return it
                    if (this.variables[refId]) {
                        v = this.variables[refId];
                    } else {
                        let result = await this.rokuAdapter.getVariable(args.expression, args.frameId, true);
                        if (!result) {
                            throw new Error(`bad variable request "${args.expression}"`);
                        }
                        v = this.getVariableFromResult(result, args.frameId);
                        //TODO - testing something, remove later
                        // eslint-disable-next-line camelcase
                        v.request_seq = response.request_seq;
                        v.frameId = args.frameId;
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
                    if (args.context === 'repl' || !this.enableDebugProtocol) {
                        let commandResults = await this.rokuAdapter.evaluate(args.expression, args.frameId);

                        commandResults.message = util.trimDebugPrompt(commandResults.message);
                        if (args.context !== 'watch') {
                            //clear variable cache since this action could have side-effects
                            this.clearState();
                            this.sendInvalidatedEvent(null, args.frameId);
                        }
                        //if the adapter captured output (probably only telnet), print it to the vscode debug console
                        if (typeof commandResults.message === 'string') {
                            this.sendEvent(new OutputEvent(commandResults.message, commandResults.type === 'error' ? 'stderr' : 'stdio'));
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
                    } else {
                        response.body = {
                            result: 'invalid',
                            variablesReference: 0
                        };
                    }
                }
            }
        } catch (error) {
            this.logger.error('Error during variables request', error);
        }
        //
        try {
            this.sendResponse(response);
        } catch { }
        deferred.resolve();
    }

    /**
     * Called when the host stops debugging
     * @param response
     * @param args
     */
    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request) {
        if (this.rokuAdapter) {
            await this.rokuAdapter.destroy();
        }
        //return to the home screen
        if (!this.enableDebugProtocol) {
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host, this.launchConfiguration.remotePort);
        }
        this.componentLibraryServer.stop();
        this.sendResponse(response);
    }

    private createRokuAdapter(host: string) {
        if (this.enableDebugProtocol) {
            this.rokuAdapter = new DebugProtocolAdapter(this.launchConfiguration, this.projectManager, this.breakpointManager);
        } else {
            this.rokuAdapter = new TelnetAdapter(this.launchConfiguration);
        }
    }

    protected async restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments, request?: DebugProtocol.Request) {
        this.logger.log('[restartRequest] begin');
        if (this.rokuAdapter) {
            if (!this.enableDebugProtocol) {
                this.rokuAdapter.removeAllListeners();
            }
            await this.rokuAdapter.destroy();
            this.rokuAdapterDeferred = defer();
        }
        await this.launchRequest(response, args.arguments as LaunchConfiguration);
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
            //sync breakpoints
            await this.rokuAdapter?.syncBreakpoints();
            this.logger.info('received "suspend" event from adapter');

            const threads = await this.rokuAdapter.getThreads();
            const activeThread = threads.find(x => x.isSelected);

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

            //if !stopOnEntry, and we haven't encountered a suspend yet, THIS is the entry breakpoint. auto-continue
            if (!this.entryBreakpointWasHandled && !this.launchConfiguration.stopOnEntry) {
                this.entryBreakpointWasHandled = true;
                //if there's a user-defined breakpoint at this exact position, it needs to be handled like a regular breakpoint (i.e. suspend). So only auto-continue if there's no breakpoint here
                if (!await this.breakpointManager.lineHasBreakpoint(this.projectManager.getAllProjects(), activeThread.filePath, activeThread.lineNumber - 1)) {
                    this.logger.info('Encountered entry breakpoint and `stopOnEntry` is disabled. Continuing...');
                    return this.rokuAdapter.continue();
                }
            }

            this.clearState();
            const event: StoppedEvent = new StoppedEvent(
                StoppedEventReason.breakpoint,
                //Not sure why, but sometimes there is no active thread. Just pick thread 0 to prevent the app from totally crashing
                activeThread?.threadId ?? 0,
                '' //exception text
            );
            // Socket debugger will always stop all threads and supports multi thread inspection.
            (event.body as any).allThreadsStopped = this.enableDebugProtocol;
            this.sendEvent(event);
        });

        //anytime the adapter encounters an exception on the roku,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.rokuAdapter.on('runtime-error', async (exception) => {
            let rokuAdapter = await this.getRokuAdapter();
            let threads = await rokuAdapter.getThreads();
            let threadId = threads[0]?.threadId;
            this.sendEvent(new StoppedEvent(StoppedEventReason.exception, threadId, exception.message));
        });

        // If the roku says it can't continue, we are no longer able to debug, so kill the debug session
        this.rokuAdapter.on('cannot-continue', () => {
            this.sendEvent(new TerminatedEvent());
        });

        //make the connection
        await this.rokuAdapter.connect();
        this.rokuAdapterDeferred.resolve(this.rokuAdapter);
        return this.rokuAdapter;
    }

    private getVariableFromResult(result: EvaluateContainer, frameId: number) {
        let v: AugmentedVariable;

        if (result) {
            if (this.enableDebugProtocol) {
                let refId = this.getEvaluateRefId(result.evaluateName, frameId);
                if (result.keyType) {
                    // check to see if this is an dictionary or a list
                    if (result.keyType === 'Integer') {
                        // list type
                        v = new Variable(result.name, result.type, refId, result.elementCount, 0);
                        this.variables[refId] = v;
                    } else if (result.keyType === 'String') {
                        // dictionary type
                        v = new Variable(result.name, result.type, refId, 0, result.elementCount);
                    }
                } else {
                    v = new Variable(result.name, `${result.value}`);
                }
                this.variables[refId] = v;
            } else {
                if (result.highLevelType === 'primative' || result.highLevelType === 'uninitialized') {
                    v = new Variable(result.name, `${result.value}`);
                } else if (result.highLevelType === 'array') {
                    let refId = this.getEvaluateRefId(result.evaluateName, frameId);
                    v = new Variable(result.name, result.type, refId, result.children?.length ?? 0, 0);
                    this.variables[refId] = v;
                } else if (result.highLevelType === 'object') {
                    let refId = this.getEvaluateRefId(result.evaluateName, frameId);
                    v = new Variable(result.name, result.type, refId, 0, result.children?.length ?? 0);
                    this.variables[refId] = v;
                } else if (result.highLevelType === 'function') {
                    v = new Variable(result.name, result.value);
                } else {
                    //all other cases, but mostly for HighLevelType.unknown
                    v = new Variable(result.name, result.value);
                }
            }

            v.type = result.type;
            v.evaluateName = result.evaluateName;
            v.frameId = frameId;
            v.type = result.type;
            v.presentationHint = result.presentationHint ? { kind: result.presentationHint } : undefined;

            if (result.children) {
                let childVariables = [];
                for (let childContainer of result.children) {
                    let childVar = this.getVariableFromResult(childContainer, frameId);
                    childVariables.push(childVar);
                }
                v.childVariables = childVariables;
            }
        }
        return v;
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
                await this.projectManager.registerEntryBreakpoint(this.projectManager.mainProject.stagingFolderPath);
            }
        }
    }

    /**
     * Called when the debugger is terminated
     */
    public shutdown() {
        //if configured, delete the staging directory
        if (!this.launchConfiguration.retainStagingFolder) {
            let stagingFolderPaths = this.projectManager.getStagingFolderPaths();
            for (let stagingFolderPath of stagingFolderPaths) {
                try {
                    fsExtra.removeSync(stagingFolderPath);
                } catch (e) {
                    util.log(`Error removing staging directory '${stagingFolderPath}': ${JSON.stringify(e)}`);
                }
            }
        }
        super.shutdown();
    }
}

interface AugmentedVariable extends DebugProtocol.Variable {
    childVariables?: AugmentedVariable[];
    // eslint-disable-next-line camelcase
    request_seq?: number;
    frameId?: number;
}
