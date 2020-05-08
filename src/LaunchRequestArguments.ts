import { FileEntry } from "roku-deploy";
import { DebugProtocol } from "vscode-debugprotocol";
import { ComponentLibraryConfig } from "./BrightScriptDebugConfiguration";

/**
 * This interface should always match the schema found in the mock-debug extension manifest.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
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
     */
    sourceDirs: string[];
    /**
     * An object of bs_const values to be updated in the manifest before side loading.
     */
    bsConst?: { [key: string]: boolean };
    /**
     * Port to access component libraries.
     */
    componentLibrariesPort: number;
    /**
     * Output folder the component libraries will be hosted in.
     */
    componentLibrariesOutDir: string;
    /**
     * An array of file path sets. One for each component library.
     * Each index is an array of file paths, file globs, or {src:string;dest:string} objects that will be copied into the hosted component library.
     * This will override the defaults, so if specified, you must provide ALL files. See https://npmjs.com/roku-deploy for examples. You must specify a componentLibrariesOutDir to use this.
     */
    componentLibraries: ComponentLibraryConfig[];
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
    /**
     * If specified, the debug session will start the roku app using the deep link
     */
    deepLinkUrl?: string;
    /*
     * Enables automatic population of the debug variable panel on a breakpoint or runtime errors.
     */
    enableVariablesPanel: boolean;
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
     */
    retainStagingFolder: boolean;

    /**
     * If true, then any source maps found will be used to convert a debug location back to a source location
     */
    enableSourceMaps: boolean;
}