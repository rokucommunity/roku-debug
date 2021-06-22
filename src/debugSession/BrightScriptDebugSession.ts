import * as fsExtra from 'fs-extra';
import { orderBy } from 'natural-orderby';
import * as path from 'path';
import * as request from 'request';
import * as rokuDeploy from 'roku-deploy';
import type { RokuDeploy } from 'roku-deploy';
import { serializeError } from 'serialize-error';
import {
    DebugSession as BaseDebugSession,
    Handles,
    InitializedEvent,
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
import { util } from '../util';
import { fileUtils, standardizePath as s } from '../FileUtils';
import { ComponentLibraryServer } from '../ComponentLibraryServer';
import { ProjectManager, Project, ComponentLibraryProject } from '../managers/ProjectManager';
import type { EvaluateContainer } from '../adapters/DebugProtocolAdapter';
import { DebugProtocolAdapter } from '../adapters/DebugProtocolAdapter';
import { TelnetAdapter } from '../adapters/TelnetAdapter';
import type { BrightScriptDebugCompileError } from '../CompileErrorProcessor';
import {
    LaunchStartEvent,
    LogOutputEvent,
    RendezvousEvent,
    CompileFailureEvent,
    StoppedEventReason,
    ChanperfEvent
} from './Events';
import type { LaunchConfiguration, ComponentLibraryConfiguration } from '../LaunchConfiguration';
import { FileManager } from '../managers/FileManager';
import { SourceMapManager } from '../managers/SourceMapManager';
import { LocationManager } from '../managers/LocationManager';
import { BreakpointManager } from '../managers/BreakpointManager';

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
        this.projectManager = new ProjectManager(this.breakpointManager, this.locationManager);
    }

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
    private enableDebugProtocol: boolean;

    private getRokuAdapter() {
        return this.rokuAdapterDeferred.promise;
    }

    private launchConfiguration: LaunchConfiguration;

    /**
     * The 'initialize' request is the first request called by the frontend
     * to interrogate the features the debug adapter provides.
     */
    public initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
        // we request them early by sending an 'initializeRequest' to the frontend.
        // The frontend will end the configuration sequence by calling 'configurationDone' request.
        this.sendEvent(new InitializedEvent());
        response.body = response.body || {};

        // This debug adapter implements the configurationDoneRequest.
        response.body.supportsConfigurationDoneRequest = true;

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
    }

    public async launchRequest(response: DebugProtocol.LaunchResponse, config: LaunchConfiguration) {
        this.launchConfiguration = config;

        this.enableDebugProtocol = this.launchConfiguration.enableDebugProtocol;

        this.projectManager.launchConfiguration = this.launchConfiguration;
        this.breakpointManager.launchConfiguration = this.launchConfiguration;

        this.sendEvent(new LaunchStartEvent(this.launchConfiguration));

        let error: Error;
        util.logDebug('Packaging and deploying to roku');
        try {
            //build the main project and all component libraries at the same time
            await Promise.all([
                this.prepareMainProject(),
                this.prepareAndHostComponentLibraries(this.launchConfiguration.componentLibraries, this.launchConfiguration.componentLibrariesPort)
            ]);

            util.log(`Connecting to Roku via ${this.enableDebugProtocol ? 'the BrightScript debug protocol' : 'telnet'} at ${this.launchConfiguration.host}`);

            this.createRokuAdapter(this.launchConfiguration.host);
            if (!this.enableDebugProtocol) {
                //connect to the roku debug via telnet
                await this.connectRokuAdapter();
            } else {
                await (this.rokuAdapter as DebugProtocolAdapter).watchCompileOutput();
            }

            await this.runAutomaticSceneGraphCommands(this.launchConfiguration.autoRunSgDebugCommands);

            util.log(`Exiting any active brightscript debugger`);
            await this.rokuAdapter.exitActiveBrightscriptDebugger();

            //pass the debug functions used to locate the client files and lines thought the adapter to the RendezvousTracker
            this.rokuAdapter.registerSourceLocator(async (debuggerPath: string, lineNumber: number) => {
                return this.projectManager.getSourceLocation(debuggerPath, lineNumber);
            });

            //pass the log level down thought the adapter to the RendezvousTracker and ChanperfTracker
            this.rokuAdapter.setConsoleOutput(this.launchConfiguration.consoleOutput);

            //pass along the console output
            if (this.launchConfiguration.consoleOutput === 'full') {
                this.rokuAdapter.on('console-output', (data) => {
                    //forward the console output
                    this.sendEvent(new OutputEvent(data, 'stdout'));
                    this.sendEvent(new LogOutputEvent(data));
                });
            } else {
                this.rokuAdapter.on('unhandled-console-output', (data) => {
                    //forward the console output
                    this.sendEvent(new OutputEvent(data, 'stdout'));
                    this.sendEvent(new LogOutputEvent(data));
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
            this.rokuAdapter.on('compile-errors', async (errors: BrightScriptDebugCompileError[]) => {
                // remove redundant errors and adjust the line number:
                // - Roku device and sourcemap work with 1-based line numbers,
                // - VS expects 0-based lines.
                const compileErrors = util.filterGenericErrors(errors);
                for (let compileError of compileErrors) {
                    let sourceLocation = await this.projectManager.getSourceLocation(compileError.path, compileError.lineNumber);
                    if (sourceLocation) {
                        compileError.path = sourceLocation.filePath;
                        compileError.lineNumber = sourceLocation.lineNumber - 1; //0-based
                    } else {
                        // TODO: may need to add a custom event if the source location could not be found by the ProjectManager
                        compileError.path = fileUtils.removeLeadingSlash(util.removeFileScheme(compileError.path));
                        compileError.lineNumber = (compileError.lineNumber || 1) - 1; //0-based
                    }
                }

                this.sendEvent(new CompileFailureEvent(compileErrors));
                //stop the roku adapter and exit the channel
                void this.rokuAdapter.destroy();
                void this.rokuDeploy.pressHomeButton(this.launchConfiguration.host);
            });

            // close disconnect if required when the app is exited
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.rokuAdapter.on('app-exit', async () => {
                if (this.launchConfiguration.stopDebuggerOnAppExit || !this.rokuAdapter.supportsMultipleRuns) {
                    let message = `App exit event detected${this.rokuAdapter.supportsMultipleRuns ? ' and launchConfiguration.stopDebuggerOnAppExit is true' : ''}`;
                    message += ' - shutting down debug session';

                    util.logDebug(message);
                    this.sendEvent(new LogOutputEvent(message));
                    if (this.rokuAdapter) {
                        void this.rokuAdapter.destroy();
                    }
                    //return to the home screen
                    await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host);
                    this.shutdown();
                    this.sendEvent(new TerminatedEvent());
                } else {
                    const message = 'App exit detected; but launchConfiguration.stopDebuggerOnAppExit is set to false, so keeping debug session running.';
                    util.logDebug(message);
                    this.sendEvent(new LogOutputEvent(message));
                }
            });

            //ignore the compile error failure from within the publish
            (this.launchConfiguration as any).failOnCompileError = false;
            // Set the remote debug flag on the args to be passed to roku deploy so the socket debugger can be started if needed.
            (this.launchConfiguration as any).remoteDebug = this.enableDebugProtocol;

            //publish the package to the target Roku
            await this.rokuDeploy.publish(this.launchConfiguration as any);

            if (this.enableDebugProtocol) {
                //connect to the roku debug via sockets
                await this.connectRokuAdapter();
            }

            //tell the adapter adapter that the channel has been launched.
            await this.rokuAdapter.activate();

            if (!error) {
                if (this.rokuAdapter.connected) {
                    // Host connection was established before the main public process was completed
                    util.logDebug(`deployed to Roku@${this.launchConfiguration.host}`);
                    this.sendResponse(response);
                } else {
                    // Main public process was completed but we are still waiting for a connection to the host
                    this.rokuAdapter.on('connected', (status) => {
                        if (status) {
                            util.logDebug(`deployed to Roku@${this.launchConfiguration.host}`);
                            this.sendResponse(response);
                        }
                    });
                }
            } else {
                throw error;
            }
        } catch (e) {
            //if the message is anything other than compile errors, we want to display the error
            //TODO: look into the reason why we are getting the 'Invalid response code: 400' on compile errors
            if (e.message !== 'compileErrors' && e.message !== 'Invalid response code: 400') {
                //TODO make the debugger stop!
                util.log('Encountered an issue during the publish process');
                util.log(e.message);
                this.sendErrorResponse(response, -1, e.message);
            } else {
                //request adapter to send errors (even empty) before ending the session
                await this.rokuAdapter.sendErrors();
            }
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
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host);
            //send the deep link http request
            await new Promise((resolve, reject) => {
                request.post(this.launchConfiguration.deepLinkUrl, (err, response) => {
                    return err ? reject(err) : resolve(response);
                });
            });
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
                                util.log(response.result.data);
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

        //prevent new breakpoints from being verified
        this.breakpointManager.lockBreakpoints();

        //write all `stop` statements to the files in the staging folder
        await this.breakpointManager.writeBreakpointsForProject(this.projectManager.mainProject);

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

                //write the `stop` statements to every file that has breakpoints
                await this.breakpointManager.writeBreakpointsForProject(compLibProject);

                await compLibProject.postfixFiles();

                await compLibProject.zipPackage({ retainStagingFolder: true });
            });

            let hostingPromise: Promise<any>;
            if (compLibPromises) {
                // prepare static file hosting
                hostingPromise = this.componentLibraryServer.startStaticFileHosting(componentLibrariesOutDir, port, (message) => {
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
        util.logDebug('sourceRequest');
        let old = this.sendResponse;
        this.sendResponse = function sendResponse(...args) {
            old.apply(this, args);
            this.sendResponse = old;
        };
        super.sourceRequest(response, args);
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments) {
        util.logDebug('configurationDoneRequest');
    }

    /**
     * Called every time a breakpoint is created, modified, or deleted, for each file. This receives the entire list of breakpoints every time.
     */
    public setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
        let sanitizedBreakpoints = this.breakpointManager.replaceBreakpoints(args.source.path, args.breakpoints);
        //sort the breakpoints
        let sortedAndFilteredBreakpoints = orderBy(sanitizedBreakpoints, [x => x.line, x => x.column])
            //filter out the inactive breakpoints
            .filter(x => x.isHidden === false);

        response.body = {
            breakpoints: sortedAndFilteredBreakpoints
        };
        this.sendResponse(response);

        //set a small timeout so the user sees the breakpoints disappear before reappearing
        //This is disabled because I'm not sure anyone actually wants this functionality, but I didn't want to lose it.
        // setTimeout(() => {
        //     //notify the client about every other breakpoint that was not explicitly requested here
        //     //(basically force to re-enable the `stop` breakpoints that were written into the source code by the debugger)
        //     var otherBreakpoints = sanitizedBreakpoints.filter(x => sortedAndFilteredBreakpoints.indexOf(x) === -1);
        //     for (var breakpoint of otherBreakpoints) {
        //         this.sendEvent(new BreakpointEvent('new', <DebugProtocol.Breakpoint>{
        //             line: breakpoint.line,
        //             verified: true,
        //             source: args.source
        //         }));
        //     }
        // }, 100);
    }

    protected exceptionInfoRequest(response: DebugProtocol.ExceptionInfoResponse, args: DebugProtocol.ExceptionInfoArguments) {
        util.logDebug('exceptionInfoRequest');
    }

    protected async threadsRequest(response: DebugProtocol.ThreadsResponse) {
        util.logDebug('threadsRequest');
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
            util.logDebug('Skipped getting threads because the RokuAdapter is not accepting input at this time.');
        }

        response.body = {
            threads: threads
        };

        this.sendResponse(response);
    }

    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
        try {
            util.logDebug('stackTraceRequest');
            let frames = [];

            if (this.rokuAdapter.isAtDebuggerPrompt) {
                let stackTrace = await this.rokuAdapter.getStackTrace(args.threadId);

                for (let debugFrame of stackTrace) {
                    let sourceLocation = await this.projectManager.getSourceLocation(debugFrame.filePath, debugFrame.lineNumber);

                    //the stacktrace returns function identifiers in all lower case. Try to get the actual case
                    //load the contents of the file and get the correct casing for the function identifier
                    try {
                        let functionName = this.fileManager.getCorrectFunctionNameCase(sourceLocation.filePath, debugFrame.functionIdentifier);
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
                    } catch (e) {
                        util.logDebug(e, sourceLocation, debugFrame);
                    }

                    let frame = new StackFrame(
                        debugFrame.frameId,
                        `${debugFrame.functionIdentifier}`,
                        new Source(path.basename(sourceLocation.filePath), sourceLocation.filePath),
                        sourceLocation.lineNumber,
                        1
                    );
                    frames.push(frame);
                }
            } else {
                util.logDebug('Skipped calculating stacktrace because the RokuAdapter is not accepting input at this time');
            }
            response.body = {
                stackFrames: frames,
                totalFrames: frames.length
            };
            this.sendResponse(response);
        } catch (e) {
            util.logDebug(e);
        }
    }

    protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
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
            this.sendResponse(response);
        } catch (e) {
            util.logDebug(e);
        }
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
        util.logDebug('continueRequest');
        await this.rokuAdapter.continue();
        this.sendResponse(response);
    }

    protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
        util.logDebug('pauseRequest');
        await this.rokuAdapter.pause();
        this.sendResponse(response);
    }

    protected reverseContinueRequest(response: DebugProtocol.ReverseContinueResponse, args: DebugProtocol.ReverseContinueArguments) {
        util.logDebug('reverseContinueRequest');
        this.sendResponse(response);
    }

    /**
     * Clicked the "Step Over" button
     * @param response
     * @param args
     */
    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
        util.logDebug('nextRequest');
        await this.rokuAdapter.stepOver(args.threadId);
        this.sendResponse(response);
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
        util.logDebug('stepInRequest');
        await this.rokuAdapter.stepInto(args.threadId);
        this.sendResponse(response);
    }

    protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
        util.logDebug('stepOutRequest');
        await this.rokuAdapter.stepOut(args.threadId);
        this.sendResponse(response);
    }

    protected stepBackRequest(response: DebugProtocol.StepBackResponse, args: DebugProtocol.StepBackArguments) {
        util.logDebug('stepBackRequest');

        this.sendResponse(response);
    }

    public async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
        try {
            util.logDebug(`variablesRequest: ${JSON.stringify(args)}`);

            let childVariables: AugmentedVariable[] = [];
            //wait for any `evaluate` commands to finish so we have a higher likely hood of being at a debugger prompt
            await this.evaluateRequestPromise;
            if (this.rokuAdapter.isAtDebuggerPrompt) {
                const reference = this.variableHandles.get(args.variablesReference);
                if (reference) {
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
                util.logDebug('Skipped getting variables because the RokuAdapter is not accepting input at this time');
            }
            this.sendResponse(response);
        } catch (e) {
            util.logDebug(e);
        }
    }

    private evaluateRequestPromise = Promise.resolve();

    public async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
        try {
            let deferred = defer<any>();

            this.evaluateRequestPromise = this.evaluateRequestPromise.then(() => {
                return deferred.promise;
            });

            //fix vscode bug that excludes closing quotemark sometimes.
            if (args.context === 'hover') {
                args.expression = util.ensureClosingQuote(args.expression);
            }

            try {

                if (this.rokuAdapter.isAtDebuggerPrompt) {
                    if (['hover', 'watch'].includes(args.context) || args.expression.toLowerCase().trim().startsWith('print ')) {
                        //if this command has the word print in front of it, remove that word
                        let expression = args.expression.replace(/^print/i, '').trim();
                        let refId = this.getEvaluateRefId(expression, args.frameId);
                        let v: AugmentedVariable;
                        //if we already looked this item up, return it
                        if (this.variables[refId]) {
                            v = this.variables[refId];
                        } else {
                            let result = await this.rokuAdapter.getVariable(expression.toLowerCase(), args.frameId, true);
                            if (!result) {
                                console.error(`bad variable request ${expression}`);
                                return;
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
                    } else if (args.context === 'repl' && !this.enableDebugProtocol) {
                        let lowerExpression = args.expression.toLowerCase().trim();

                        if (['cont', 'c'].includes(lowerExpression)) {
                            await this.rokuAdapter.continue();

                        } else if (lowerExpression === 'over') {
                            await this.rokuAdapter.stepOver(-1);

                        } else if (['step', 's', 't'].includes(lowerExpression)) {
                            await this.rokuAdapter.stepInto(-1);

                        } else if (lowerExpression === 'out') {
                            await this.rokuAdapter.stepOut(-1);

                        } else if (['down', 'd', 'exit', 'thread', 'th', 'up', 'u'].includes(lowerExpression)) {
                            await (this.rokuAdapter as TelnetAdapter).requestPipeline.executeCommand(args.expression, false);

                        } else {
                            const promise = this.rokuAdapter.evaluate(args.expression);
                            response.body = <any>{
                                result: await promise
                            };
                            // //print the output to the screen
                            // this.sendEvent(new OutputEvent(result, 'stdout'));
                            // TODO: support var? maybe?
                        }
                    }
                } else {
                    util.logDebug('Skipped evaluate request because RokuAdapter is not accepting requests at this time');
                }
            } finally {
                deferred.resolve();
            }
            this.sendResponse(response);
        } catch (e) {
            util.logDebug(e);
        }
    }

    /**
     * Called when the host stops debugging
     * @param response
     * @param args
     */
    protected async disconnectRequest(response: any, args: any) {
        if (this.rokuAdapter) {
            await this.rokuAdapter.destroy();
        }
        //return to the home screen
        if (!this.enableDebugProtocol) {
            await this.rokuDeploy.pressHomeButton(this.launchConfiguration.host);
        }
        this.componentLibraryServer.stop();
        this.sendResponse(response);
    }

    private createRokuAdapter(host: string) {
        if (this.enableDebugProtocol) {
            this.rokuAdapter = new DebugProtocolAdapter(host, this.launchConfiguration.stopOnEntry);
        } else {
            this.rokuAdapter = new TelnetAdapter(host, this.launchConfiguration.enableDebuggerAutoRecovery);
        }
    }

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
            let threads = await this.rokuAdapter.getThreads();
            let threadId = threads[0].threadId;

            this.clearState();
            let exceptionText = '';
            const event: StoppedEvent = new StoppedEvent(StoppedEventReason.breakpoint, threadId, exceptionText);
            // Socket debugger will always stop all threads and supports multi thread inspection.
            (event.body as any).allThreadsStopped = this.enableDebugProtocol;
            this.sendEvent(event);
        });

        //anytime the adapter encounters an exception on the roku,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.rokuAdapter.on('runtime-error', async (exception) => {
            let rokuAdapter = await this.getRokuAdapter();
            let threads = await rokuAdapter.getThreads();
            let threadId = threads[0].threadId;
            this.sendEvent(new StoppedEvent(StoppedEventReason.exception, threadId, exception.message));
        });

        // If the roku says it can't continue, we are no longer able to debug, so kill the debug session
        this.rokuAdapter.on('cannot-continue', () => {
            this.sendEvent(new TerminatedEvent());
        });
        //make the connection
        await this.rokuAdapter.connect();
        this.rokuAdapterDeferred.resolve(this.rokuAdapter);
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
                }
            }

            v.type = result.type;
            v.evaluateName = result.evaluateName;
            v.frameId = frameId;

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
     * If `stopOnEntry` is enabled, register the entry breakpoint.
     */
    public async handleEntryBreakpoint() {
        if (this.launchConfiguration.stopOnEntry && !this.enableDebugProtocol) {
            await this.projectManager.registerEntryBreakpoint(this.projectManager.mainProject.stagingFolderPath);
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

export function defer<T>() {
    let _resolve: (value?: PromiseLike<T> | T) => void;
    let _reject: (reason?: any) => void;
    let promise = new Promise<T>((resolveValue, rejectValue) => {
        _resolve = resolveValue;
        _reject = rejectValue;
    });
    return {
        promise: promise,
        resolve: function resolve(value?: PromiseLike<T> | T) {
            if (!this.isResolved) {
                this.isResolved = true;
                _resolve(value);
                _resolve = undefined;
            } else {
                throw new Error(
                    `Attempted to resolve a promise that was already ${this.isResolved ? 'resolved' : 'rejected'}.` +
                    `New value: ${JSON.stringify(value)}`
                );
            }
        },
        reject: function reject(reason?: any) {
            if (!this.isCompleted) {
                this.isRejected = true;
                _reject(reason);
                _reject = undefined;
            } else {
                throw new Error(
                    `Attempted to reject a promise that was already ${this.isResolved ? 'resolved' : 'rejected'}.` +
                    `New error message: ${JSON.stringify(serializeError(reason))}`
                );
            }
        },
        isResolved: false,
        isRejected: false,
        get isCompleted() {
            return this.isResolved || this.isRejected;
        }
    };
}
