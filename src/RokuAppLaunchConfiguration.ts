import * as path from 'path';
import type { FileEntry } from 'roku-deploy';
import type { ComponentLibraryConfiguration } from './LaunchConfiguration';

/**
 * The raw config shape accepted in launch.json for the `launch-roku-app` type.
 * No deprecated properties from LaunchConfiguration are carried over.
 */
export interface RokuAppLaunchConfig {
    type: 'launch-roku-app';
    request: 'launch';
    /** Display name shown in the Run & Debug panel */
    name: string;

    // ── Core / Device ────────────────────────────────────────────────────────

    /** IP address or hostname of the target Roku device */
    host: string;
    /** Developer page password. Not required when skipUpload is true */
    password?: string;
    /** Port used to upload packages to the device. @default 80 */
    packagePort?: number;
    /** ECP port used to send launch/control commands. @default 8060 */
    remotePort?: number;
    /** Path to a .env file whose values are merged into the launch config */
    envFile?: string;

    // ── Launch Behavior ───────────────────────────────────────────────────────

    /**
     * The app/channel ID to launch via ECP.
     * Use "dev" for a sideloaded channel, or a numeric store channel ID.
     * @default "dev"
     */
    channelId?: string;
    /**
     * Controls whether the channel is exited before launching.
     * - "never"         — launch regardless of current state
     * - "always"        — always close the channel before launching
     * - "whenForeground"— only close if the channel is currently in the foreground
     * @default "always"
     */
    exitBeforeLaunch?: 'never' | 'always' | 'whenForeground';
    /**
     * Skip staging and uploading entirely. The configured channelId will be
     * launched via ECP only. The channel must already be installed on the device.
     * @default false
     */
    skipUpload?: boolean;
    /**
     * Delete the currently installed dev channel before uploading the new package.
     * Has no effect when skipUpload is true.
     * @default false
     */
    deleteDevChannelBeforeInstall?: boolean;
    /** An ECP deep link URL to send after the channel launches */
    deepLinkUrl?: string;

    // ── Build / Packaging ─────────────────────────────────────────────────────

    /** Root directory of the Roku project. Should contain the manifest file */
    rootDir?: string;
    /** List of files/globs to include in the package */
    files?: FileEntry[];
    /**
     * Source directories when rootDir points to a build output folder.
     * Used to resolve pkg:/ paths in device logs back to source files.
     */
    sourceDirs?: string[];
    /** Output directory for the generated zip */
    outDir?: string;
    /** Path for the staging folder */
    stagingDir?: string;
    /**
     * If true, the staging folder is not deleted after launch.
     * @default false
     */
    retainStagingFolder?: boolean;
    /**
     * If true, the zip archive is not deleted after launch.
     * @default true
     */
    retainDeploymentArchive?: boolean;
    /** Name of a VS Code task to run instead of roku-deploy to produce the zip */
    packageTask?: string;
    /** Path to a pre-built zip to upload directly, skipping the staging step */
    packagePath?: string;
    /** Overrides for the roku-deploy upload request (route and form data) */
    packageUploadOverrides?: {
        /** @default 'plugin_install' */
        route: string;
        /** A dictionary of form fields. Set a value to null to remove it from the form */
        formData: Record<string, any>;
    };
    /** BS_CONST values to inject into the manifest before sideloading */
    bsConst?: Record<string, boolean>;

    // ── Source Maps / Log Rewriting ───────────────────────────────────────────

    /**
     * Use source maps to resolve pkg:/ paths in console output back to source locations.
     * @default true
     */
    enableSourceMaps?: boolean;
    /**
     * Rewrite pkg:/source/file.brs:10 style paths in device logs to their source file equivalents.
     * @default true
     */
    rewriteDevicePathsInLogs?: boolean;

    // ── Runtime Diagnostics ───────────────────────────────────────────────────

    /**
     * Enable ECP rendezvous tracking, or fall back to port 8080 tracking on older devices.
     * @default true
     */
    rendezvousTracking?: boolean;
    /** SceneGraph debug commands to run at the start of the session */
    autoRunSgDebugCommands?: string[];
    /**
     * Port used to send SceneGraph debug commands.
     * @default 8080
     */
    sceneGraphDebugCommandsPort?: number;
    /**
     * Telnet port. Device console output is streamed to the VS Code output panel.
     * @default 8085
     */
    brightScriptConsolePort?: number;

    // ── Profiling ─────────────────────────────────────────────────────────────

    profiling?: {
        tracing?: {
            /** Enable Perfetto event tracing */
            enable?: boolean;
            /** Directory where trace files are saved */
            dir?: string;
            /** Trace filename. Supports ${appTitle} and ${timestamp} variables */
            filename?: string;
            /** Connect to Perfetto immediately when the session starts */
            connectOnStart?: boolean;
        };
    };

    // ── File Logging ──────────────────────────────────────────────────────────

    fileLogging?: boolean | {
        enabled?: boolean;
        dir?: string;
        logLimit?: number;
        rokuDevice?: boolean | {
            enabled?: boolean;
            dir?: string;
            filename?: string;
            mode?: 'session' | 'append';
            logLimit?: number;
        };
    };

    // ── RDB (Roku Debug Bridge) ───────────────────────────────────────────────

    /**
     * Inject the RDB OnDeviceComponent onto the device for RALE-like functionality.
     * @default false
     */
    injectRdbOnDeviceComponent?: boolean;
    /** Base path to the folder containing RDB files for the OnDeviceComponent */
    rdbFilesBasePath?: string;
    /**
     * Disable the screensaver while the deployed application is running.
     * Only applicable when injectRdbOnDeviceComponent is true.
     * @default false
     */
    disableScreenSaver?: boolean;

    // ── Component Libraries ───────────────────────────────────────────────────

    /** Component libraries to stage and host alongside the main app */
    componentLibraries?: ComponentLibraryConfiguration[];
    /**
     * Port for the local web server that serves component library packages to the device.
     * @default 8080
     */
    componentLibrariesPort?: number;
    /** Output folder for component library zips */
    componentLibrariesOutDir?: string;
}

/**
 * Wraps a raw RokuAppLaunchConfig and exposes each setting as a lazy-resolved getter.
 * The raw config is preserved unchanged; resolved values are cached on first access.
 */
export class RokuAppLaunchConfiguration {

    public constructor(rawConfig: RokuAppLaunchConfig) {
        this.rawConfig = rawConfig;
    }

    /** The original unmodified config as provided by the caller */
    public readonly rawConfig: RokuAppLaunchConfig;

    /** Cache of values that have already been resolved */
    private resolved: Partial<RokuAppLaunchConfig> = {};

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Returns a cached resolved value, computing it on first access via the provided factory.
     */
    private resolve<K extends keyof RokuAppLaunchConfig>(key: K, factory: () => RokuAppLaunchConfig[K]): RokuAppLaunchConfig[K] {
        if (!(key in this.resolved)) {
            this.resolved[key] = factory() as any;
        }
        return this.resolved[key] as RokuAppLaunchConfig[K];
    }

    /**
     * Resolves a path relative to cwd when the value is a relative path, otherwise returns as-is.
     */
    private resolvePath(value: string | undefined): string | undefined {
        if (!value) {
            return value;
        }
        return path.isAbsolute(value) ? value : path.resolve(this.cwd, value);
    }

    /**
     * The working directory used as a base for resolving relative paths.
     * Derived from rootDir when set, otherwise falls back to process.cwd().
     */
    private get cwd(): string {
        return this.rawConfig.rootDir
            ? path.resolve(this.rawConfig.rootDir)
            : process.cwd();
    }

    // ── Core / Device ─────────────────────────────────────────────────────────

    get type(): 'launch-roku-app' {
        return 'launch-roku-app';
    }

    get request(): 'launch' {
        return 'launch';
    }

    get name(): string {
        return this.rawConfig.name;
    }

    get host(): string {
        return this.rawConfig.host;
    }

    get password(): string | undefined {
        return this.rawConfig.password;
    }

    get packagePort(): number {
        return this.resolve('packagePort', () => this.rawConfig.packagePort ?? 80);
    }

    get remotePort(): number {
        return this.resolve('remotePort', () => this.rawConfig.remotePort ?? 8060);
    }

    get envFile(): string | undefined {
        return this.resolve('envFile', () => this.resolvePath(this.rawConfig.envFile));
    }

    // ── Launch Behavior ───────────────────────────────────────────────────────

    get channelId(): string {
        return this.resolve('channelId', () => this.rawConfig.channelId ?? 'dev');
    }

    get exitBeforeLaunch(): 'never' | 'always' | 'whenForeground' {
        return this.resolve('exitBeforeLaunch', () => this.rawConfig.exitBeforeLaunch ?? 'always');
    }

    get skipUpload(): boolean {
        return this.resolve('skipUpload', () => this.rawConfig.skipUpload ?? false);
    }

    get deleteDevChannelBeforeInstall(): boolean {
        return this.resolve('deleteDevChannelBeforeInstall', () => this.rawConfig.deleteDevChannelBeforeInstall ?? false);
    }

    get deepLinkUrl(): string | undefined {
        return this.rawConfig.deepLinkUrl;
    }

    // ── Build / Packaging ─────────────────────────────────────────────────────

    get rootDir(): string | undefined {
        return this.resolve('rootDir', () => this.resolvePath(this.rawConfig.rootDir));
    }

    get files(): FileEntry[] | undefined {
        return this.rawConfig.files;
    }

    get sourceDirs(): string[] | undefined {
        return this.resolve('sourceDirs', () => this.rawConfig.sourceDirs?.map(d => this.resolvePath(d) as string));
    }

    get outDir(): string | undefined {
        return this.resolve('outDir', () => this.resolvePath(this.rawConfig.outDir));
    }

    get stagingDir(): string | undefined {
        return this.resolve('stagingDir', () => this.resolvePath(this.rawConfig.stagingDir));
    }

    get retainStagingFolder(): boolean {
        return this.resolve('retainStagingFolder', () => this.rawConfig.retainStagingFolder ?? false);
    }

    get retainDeploymentArchive(): boolean {
        return this.resolve('retainDeploymentArchive', () => this.rawConfig.retainDeploymentArchive ?? true);
    }

    get packageTask(): string | undefined {
        return this.rawConfig.packageTask;
    }

    get packagePath(): string | undefined {
        return this.resolve('packagePath', () => this.resolvePath(this.rawConfig.packagePath));
    }

    get packageUploadOverrides(): RokuAppLaunchConfig['packageUploadOverrides'] {
        return this.rawConfig.packageUploadOverrides;
    }

    get bsConst(): Record<string, boolean> | undefined {
        return this.rawConfig.bsConst;
    }

    // ── Source Maps / Log Rewriting ───────────────────────────────────────────

    get enableSourceMaps(): boolean {
        return this.resolve('enableSourceMaps', () => this.rawConfig.enableSourceMaps ?? true);
    }

    get rewriteDevicePathsInLogs(): boolean {
        return this.resolve('rewriteDevicePathsInLogs', () => this.rawConfig.rewriteDevicePathsInLogs ?? true);
    }

    // ── Runtime Diagnostics ───────────────────────────────────────────────────

    get rendezvousTracking(): boolean {
        return this.resolve('rendezvousTracking', () => this.rawConfig.rendezvousTracking ?? true);
    }

    get autoRunSgDebugCommands(): string[] {
        return this.resolve('autoRunSgDebugCommands', () => this.rawConfig.autoRunSgDebugCommands ?? []);
    }

    get sceneGraphDebugCommandsPort(): number {
        return this.resolve('sceneGraphDebugCommandsPort', () => this.rawConfig.sceneGraphDebugCommandsPort ?? 8080);
    }

    get brightScriptConsolePort(): number {
        return this.resolve('brightScriptConsolePort', () => this.rawConfig.brightScriptConsolePort ?? 8085);
    }

    // ── Profiling ─────────────────────────────────────────────────────────────

    get profiling(): RokuAppLaunchConfig['profiling'] {
        return this.rawConfig.profiling;
    }

    // ── File Logging ──────────────────────────────────────────────────────────

    get fileLogging(): RokuAppLaunchConfig['fileLogging'] {
        return this.rawConfig.fileLogging;
    }

    // ── RDB (Roku Debug Bridge) ───────────────────────────────────────────────

    get injectRdbOnDeviceComponent(): boolean {
        return this.resolve('injectRdbOnDeviceComponent', () => this.rawConfig.injectRdbOnDeviceComponent ?? false);
    }

    get rdbFilesBasePath(): string | undefined {
        return this.resolve('rdbFilesBasePath', () => this.resolvePath(this.rawConfig.rdbFilesBasePath));
    }

    get disableScreenSaver(): boolean {
        return this.resolve('disableScreenSaver', () => this.rawConfig.disableScreenSaver ?? false);
    }

    // ── Component Libraries ───────────────────────────────────────────────────

    get componentLibraries(): ComponentLibraryConfiguration[] {
        return this.resolve('componentLibraries', () => this.rawConfig.componentLibraries ?? []);
    }

    get componentLibrariesPort(): number {
        return this.resolve('componentLibrariesPort', () => this.rawConfig.componentLibrariesPort ?? 8080);
    }

    get componentLibrariesOutDir(): string | undefined {
        return this.resolve('componentLibrariesOutDir', () => this.resolvePath(this.rawConfig.componentLibrariesOutDir));
    }
}
