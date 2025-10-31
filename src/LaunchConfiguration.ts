import type { FileEntry } from 'roku-deploy';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { LogLevel } from './logging';

/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchConfiguration extends DebugProtocol.LaunchRequestArguments {
    /**
     * The current working directory of the launcher. When running from vscode, this should be the value from `${workspaceFolder}`
     */
    cwd: string;
    /**
     * The host or ip address for the target Roku
     */
    host: string;

    /**
     * The password for the developer page on the target Roku
     */
    password: string;

    /**
     * The root directory that contains your Roku project. This path should point to the folder containing your manifest file
     */
    rootDir: string;

    /**
     * If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folder
     * so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change
     * line offsets between source files and built files, otherwise debugger lines will be out of sync.
     * @deprecated Use sourceDirs instead
     */
    debugRootDir: string;

    /**
     * If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folders
     * so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change
     * line offsets between source files and built files, otherwise debugger lines will be out of sync.
     * This option is not necessary if your build system generates source maps
     */
    sourceDirs: string[];

    /**
     * An object of bs_const values to be updated in the manifest before side loading.
     */
    bsConst?: Record<string, boolean>;

    /**
     * Port used to use when spinning up a web server to host component libraries. This runs on the developer machine and does not correspond to a port on the Roku device.
     * Defaults to 8080
     * @default 8080
     */
    componentLibrariesPort: number;

    /**
     * Output folder the component libraries will be hosted in.
     */
    componentLibrariesOutDir: string;

    /**
     * An array of component library configurations. A web server will be spun up to serve all of these libraries.
     */
    componentLibraries: ComponentLibraryConfiguration[];

    /**
     * An array of of SceneGraph debug commands to be run at the start of a debug session.
     */
    autoRunSgDebugCommands: string[];

    /**
     * The folder where the output files are places during the packaging process
     */
    outDir?: string;

    /**
     * If true, stop at the first executable line of the program
     */
    stopOnEntry: boolean;

    /**
     * Determines which console output event to listen for.
     * 'full' is every console message (including the ones from the adapter).
     * 'normal' excludes output initiated by the adapter and rendezvous logs if enabled on the device.
     */
    consoleOutput: 'full' | 'normal';

    fileLogging?: boolean | {
        /**
         * Should file logging be enabled
         */
        enabled?: boolean;
        /**
         * Directory where log files should be stored. used when filename is relative
         */
        dir?: string;
        /**
         * The number of log files to keep. undefined or < 0 means keep all
         */
        logLimit?: number;
        /**
         * File logging for the telnet or IO output from the Roku device currently being debugged. (i.e. all the stuff produced by `print` statements in your code)
         */
        rokuDevice?: boolean | {
            /**
             * Should file logging be enabled for this logging type?
             */
            enabled?: boolean;
            /**
             * Directory where log files should be stored. used when filename is relative
             */
            dir?: string;
            /**
             * The name of the log file. When mode==='session', a datestamp will be prepended to this filename.
             * Can be absolute or relative, and relative paths will be relative to `this.dir`
             */
            filename?: string;
            /**
             * - 'session' means a unique timestamped file will be created on every debug session.
             * - 'append' means all logs will be appended to a single file
             */
            mode?: 'session' | 'append';
            /**
             * The number of log files to keep. undefined or < 0 means keep all
             */
            logLimit?: number;
        };
        /**
         * File logging for the debugger. Mostly used to provide crash logs to the RokuCommunity team.
         */
        debugger?: boolean | {
            /**
             * Should file logging be enabled for this logging type?
             */
            enabled?: boolean;
            /**
             * Directory where log files should be stored. used when filename is relative
             */
            dir?: string;
            /**
             * The name of the log file. When mode==='session', a datestamp will be prepended to this filename.
             * Can be absolute or relative, and relative paths will be relative to `this.dir`
             */
            filename?: string;
            /**
             * - 'session' means a unique timestamped file will be created on every debug session.
             * - 'append' means all logs will be appended to a single file
             */
            mode?: 'session' | 'append';
            /**
             * The number of log files to keep. undefined or < 0 means keep all
             */
            logLimit?: number;
        };
    };

    /**
     * If specified, the debug session will start the roku app using the deep link
     */
    deepLinkUrl?: string;

    /**
     * Enables automatic population of the debug variable panel on a breakpoint or runtime errors.
     * @deprecated Use `deferScopeLoading` instead
     */
    enableVariablesPanel: boolean;

    /**
     * Will defer the population of the 'Local' scope variables until the user expands it in the variables panel.
     * @default false
     */
    deferScopeLoading: boolean;

    /**
     * Enables automatic population of the virtual variables.
     */
    autoResolveVirtualVariables: boolean;

    /**
     * Enables scanning deployment files for additional REPL completions,
     * such as user-defined functions. This process runs in a background
     * thread and may be resource-intensive.
     * @default true
     */
    enhanceREPLCompletions?: boolean;

    /**
     * If true, will attempt to skip false breakpoints created by the micro debugger, which are particularly prevalent for SG apps with multiple run loops.
     */
    enableDebuggerAutoRecovery: boolean;

    /**
     * If true, the debugger will use the new beta BrightScript debug protocol and disable the telnet debugger. See for more details: https://developer.roku.com/en-ca/docs/developer-program/debugging/socket-based-debugger.md.
     */
    enableDebugProtocol: boolean;

    /**
     * If true, will terminate the debug session if app exit is detected. This currently relies on 9.1+ launch beacon notifications, so will not work on a pre 9.1 device.
     */
    stopDebuggerOnAppExit: boolean;

    /**
     * Will inject the OnDeviceComponent used by RDB for RALE like functionality inside of vscode.
     */
    injectRdbOnDeviceComponent: boolean;

    /**
     * Base path to the folder containing RDB files for OnDeviceComponent
     */
    rdbFilesBasePath: string;

    /**
     * Will inject the Roku Advanced Layout Editor(RALE) TrackerTask into your channel if one is defined in your user settings.
     */
    injectRaleTrackerTask: boolean;

    /**
     * This is an absolute path to the TrackerTask.xml file to be injected into your Roku channel during a debug session.
     */
    raleTrackerTaskFileLocation: string;

    /**
     * The list of files that should be bundled during a debug session
     */
    files?: FileEntry[];

    /**
     * If true, then the staging folder is NOT deleted after a debug session has been closed
     * @default false
     */
    retainStagingFolder?: boolean;

    /**
     *  If true, then the zip archive is NOT deleted after a debug session has been closed.
     * @default true
     */
    retainDeploymentArchive?: boolean;

    /**
     * If true, then any source maps found will be used to convert a debug location back to a source location
     */
    enableSourceMaps?: boolean;

    /**
     * If true, then any pkg path found in the device logs will be converted to a source location leveraging source maps if available
     *
     * Supported formats:
     * - pkg:/source/main.brs:10
     * - pkg:/source/main.brs(10)
     * - pkg:/source/main.brs:10:20
     * - pkg:/source/main.brs(10:20)
     * - ...ce/main.brs:10
     * - ...ce/main.brs(10)
     * - ...ce/main.brs:10:20
     * - ...ce/main.brs(10:20)
     * @default true
     */
    rewriteDevicePathsInLogs?: boolean;

    /**
     * The port that should be used when installing the package. Defaults to 80.
     * This is mainly useful for things like emulators that use alternate ports,
     * or when publishing through some type of port forwarding configuration.
     * @default 80
     */
    packagePort?: number;

    /**
     * The port used to send remote control commands (like home press, back, etc.). Defaults to 8060.
     * This is mainly useful for things like emulators that use alternate ports,
     * or when sending commands through some type of port forwarding.
     * @default 8060
     */
    remotePort?: number;

    /**
     * The port that should be used to send SceneGraph debug commands. Defaults to 8080.
     * @default 8080
     */
    sceneGraphDebugCommandsPort: number;

    /**
     * Port used to connect to and control a debug protocol session.
     * This is mainly useful for things like emulators that use alternate ports,
     * or when connecting to the debug protocol through some type of port forwarding. Defaults to 8081.
     * @default 8081
     */
    controlPort: number;

    /**
     * The brightscript console port. In telnet mode this is the port used for the primary telnet connection. In debug protocol mode, this is used to obtain compile errors from the device. Defaults to 8085.
     * @default 8085
     */
    brightScriptConsolePort?: number;

    /**
     * The path used for the staging folder of roku-deploy
     * This should generally be set to "${cwd}/.roku-deploy-staging", but that's ultimately up to the debug client.
     * @deprecated use `stagingDir` instead
     */
    stagingFolderPath?: string;

    /**
     * Path used for the staging folder where files are written right before being packaged. This folder will contain any roku-debug related sourcemaps,
     * as well as having breakpoints injected into source code
     */
    stagingDir?: string;

    /**
     * What level of debug server's internal logging should be performed in the debug session
     */
    logLevel: LogLevel;

    /**
     * Show variables that are prefixed with a special prefix designated to be hidden
     */
    showHiddenVariables: boolean;

    /**
     * If true: turn on ECP rendezvous tracking, or turn on 8080 rendezvous tracking if ECP unsupported
     * If false, turn off both.
     * @default true
     */
    rendezvousTracking: boolean;

    /**
     * Delete any currently installed dev channel before starting the debug session
     * @default false
     */
    deleteDevChannelBeforeInstall: boolean;

    /**
     * Task to run instead of roku-deploy to produce the .zip file that will be uploaded to the Roku.
     */
    packageTask: string;

    /**
     * Path to the .zip that will be uploaded to the Roku
     */
    packagePath: string;

    /**
     * Overrides for values used during the roku-deploy zip upload process, like the route and various form data. You probably don't need to change these..
     */
    packageUploadOverrides?: {
        /**
         * The route to use for uploading to the Roku device. Defaults to 'plugin_install'
         * @default 'plugin_install'
         */
        route: string;

        /**
         * A dictionary of form fields to be included in the package upload request. Set a value to null to delete from the form
         */
        formData: Record<string, any>;
    };

    /**
     * Should the ChannelPublishedEvent be emitted. This is a hack for when certain roku devices become locked up as a result of this event
     * being emitted. You probably don't need to set this
     * @default true
     */
    emitChannelPublishedEvent?: boolean;

    /**
     * Should the main library and component libraries be hosted synchronously. This is for when certain libraries like "DCL" require it
     * if not set the default is false unless one of the libraries requires it
     * @default true
     */
    prepareProjectFilesSynchronously?: boolean;
}

export interface ComponentLibraryConfiguration {
    /**
     * The root directory for the component library project. This path should point to the folder containing the manifest file
     */
    rootDir: string;
    /**
     * The filename for the package.
     */
    outFile: string;
    /**
     * The list of files that should be bundled during a debug session
     */
    files: FileEntry[];
    /**
     * If you have a build system, rootDir will point to the build output folder, and this path should point to the actual source folders
     * so that breakpoints can be set in the source files when debugging. In order for this to work, your build process cannot change
     * line offsets between source files and built files, otherwise debugger lines will be out of sync.
     * This option is not necessary if your build system generates source maps
     */
    sourceDirs: string[];
    /**
     * An object of bs_const values to be updated in the manifest before side loading.
     */
    bsConst?: Record<string, boolean>;
    /**
     * Will inject the Roku Advanced Layout Editor(RALE) TrackerTask into the component library if one is defined in your user settings.
     */
    injectRaleTrackerTask: boolean;
    /**
     * This is an absolute path to the TrackerTask.xml file to be injected into the component library during a debug session.
     */
    raleTrackerTaskFileLocation: string;

    libType?: 'channelstore' | 'remote' | 'other';
    host?: string;
    username?: string;
    password?: string;
}
