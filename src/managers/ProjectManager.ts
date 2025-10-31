import * as assert from 'assert';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { rokuDeploy, RokuDeploy, util as rokuDeployUtil } from 'roku-deploy';
import type { FileEntry } from 'roku-deploy';
import * as glob from 'glob';
import { promisify } from 'util';
const globAsync = promisify(glob);
import type { BreakpointManager } from './BreakpointManager';
import { fileUtils, standardizePath as s } from '../FileUtils';
import type { LocationManager, SourceLocation } from './LocationManager';
import { util } from '../util';
import { logger } from '../logging';
import { Cache } from 'brighterscript/dist/Cache';
import { BscProjectThreaded } from '../bsc/BscProjectThreaded';
import type { ScopeFunction } from '../bsc/BscProject';
import type { Position } from 'brighterscript';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const replaceInFile = require('replace-in-file');

export const componentLibraryPostfix = '__lib';

/**
 * Manages the collection of brightscript projects being used in a debug session.
 * Will contain the main project (in rootDir), as well as component libraries.
 */
export class ProjectManager {
    public constructor(
        options: {
            /**
             * A class that keeps track of all the breakpoints for a debug session.
             * It needs to be notified of any changes in breakpoints
             */
            breakpointManager: BreakpointManager;
            locationManager: LocationManager;
        }
    ) {
        this.breakpointManager = options.breakpointManager;
        this.locationManager = options.locationManager;
    }

    private breakpointManager: BreakpointManager;

    private locationManager: LocationManager;

    public launchConfiguration: {
        enableSourceMaps?: boolean;
        enableDebugProtocol?: boolean;
        packagePath: string;
    };

    public logger = logger.createLogger('[ProjectManager]');

    public mainProject: Project;
    public componentLibraryProjects: (RemoteComponentLibraryProject)[] = [];

    public addComponentLibraryProject(project: RemoteComponentLibraryProject) {
        this.componentLibraryProjects.push(project);
    }

    public getAllProjects() {
        return [
            ...(this.mainProject ? [this.mainProject] : []),
            ...(this.componentLibraryProjects ?? [])
        ];
    }

    /**
     * Get the list of staging folder paths from all projects
     */
    public getStagingDirs() {
        let projects = [
            ...(this.mainProject ? [this.mainProject] : []),
            ...(this.componentLibraryProjects ?? [])
        ];
        return projects.map(x => x.stagingDir);
    }

    /**
     * Get all of the functions avaiable for all scopes for this file.
     * @param pkgPath the device path of the file (probably with `pkg:` or `libpkg` or something...)
     * @returns
     */
    public async getScopeFunctionsForFile(pkgPath: string): Promise<Array<ScopeFunction>> {
        let completions: ScopeFunction[] = [];
        try {
            const fileInfo = await this.getStagingFileInfo(pkgPath);
            completions = await fileInfo?.project.getScopeFunctionsForFile(fileInfo.relativePath);
        } catch (error) {
            this.logger.error(`error loading completions for file ${pkgPath}`, error);
        }
        return completions;
    }

    /**
     * Get the range of the scope for the given position in the file
     * @param pkgPath the device path of the file (probably with `pkg:` or `libpkg` or something...)
     * @param position the position in the file to get the scope range for
     */
    public async getScopeRange(pkgPath: string, position: Position) {
        try {
            const fileInfo = await this.getStagingFileInfo(pkgPath);
            const parentFunctionRange = await fileInfo?.project.getScopeRange(fileInfo.relativePath, position);
            if (parentFunctionRange) {
                const [startPosition, endPosition] = await Promise.all([
                    this.getSourceLocation(pkgPath, parentFunctionRange.start.line + 1),
                    this.getSourceLocation(pkgPath, parentFunctionRange.end.line + 1)
                ]);
                return {
                    start: {
                        line: startPosition.lineNumber,
                        column: startPosition.columnIndex
                    },
                    end: {
                        line: endPosition.lineNumber,
                        column: endPosition.columnIndex
                    }
                };
            }
        } catch (error) {
            this.logger.error(`error loading scope range for file ${pkgPath}`, error);
        }
        return undefined;
    }

    /**
     * Given a debugger path and line number, compensate for the injected breakpoint line offsets
     * @param filePath - the path to the file that may or may not have breakpoints
     * @param debuggerLineNumber - the line number from the debugger
     */
    public getLineNumberOffsetByBreakpoints(filePath: string, debuggerLineNumber: number) {
        let breakpoints = this.breakpointManager.getPermanentBreakpointsForFile(filePath);
        //throw out duplicate breakpoints (account for entry breakpoint) and sort them ascending
        breakpoints = this.breakpointManager.sortAndRemoveDuplicateBreakpoints(breakpoints);

        let sourceLineByDebuggerLine = {};
        let sourceLineNumber = 0;
        for (let loopDebuggerLineNumber = 1; loopDebuggerLineNumber <= debuggerLineNumber; loopDebuggerLineNumber++) {
            sourceLineNumber++;
            sourceLineByDebuggerLine[loopDebuggerLineNumber] = sourceLineNumber;

            /**
             * A line with a breakpoint on it should share the same debugger line number.
             * The injected `STOP` line will be given the correct line number automatically,
             * but we need to compensate for the actual code line. So if there's a breakpoint
             * on this line, handle the next line's mapping as well (and skip one iteration of the loop)
             */
            // eslint-disable-next-line @typescript-eslint/no-loop-func
            let breakpointForLine = breakpoints.find(x => x.line === sourceLineNumber);
            if (breakpointForLine) {
                sourceLineByDebuggerLine[loopDebuggerLineNumber + 1] = sourceLineNumber;
                loopDebuggerLineNumber++;
            }
        }

        return sourceLineByDebuggerLine[debuggerLineNumber];
    }

    public sourceLocationCache = new Cache<string, Promise<SourceLocation>>();

    /**
     * @param debuggerPath
     * @param debuggerLineNumber - the 1-based line number from the debugger
     * @param debuggerColumnNumber - the 1-based column number from the debugger
     */
    public async getSourceLocation(debuggerPath: string, debuggerLineNumber: number, debuggerColumnNumber = 1) {
        return this.sourceLocationCache.getOrAdd(`${debuggerPath}-${debuggerLineNumber}`, async () => {
            //get source location using
            let stagingFileInfo = await this.getStagingFileInfo(debuggerPath);
            if (!stagingFileInfo) {
                return;
            }
            let project = stagingFileInfo.project;

            //remove the component library postfix if present
            if (project instanceof RemoteComponentLibraryProject) {
                stagingFileInfo.absolutePath = fileUtils.unPostfixFilePath(stagingFileInfo.absolutePath, project.postfix);
                stagingFileInfo.relativePath = fileUtils.unPostfixFilePath(stagingFileInfo.relativePath, project.postfix);
            }

            let sourceLocation = await this.locationManager.getSourceLocation({
                lineNumber: debuggerLineNumber,
                columnIndex: debuggerColumnNumber - 1,
                fileMappings: project.fileMappings,
                rootDir: project.rootDir,
                stagingFilePath: stagingFileInfo.absolutePath,
                stagingDir: project.stagingDir,
                sourceDirs: project.sourceDirs,
                enableSourceMaps: this.launchConfiguration?.enableSourceMaps ?? true
            });

            //if sourcemaps are disabled, and this is a telnet debug dession, account for breakpoint offsets
            if (sourceLocation && this.launchConfiguration?.enableSourceMaps === false && !this.launchConfiguration.enableDebugProtocol) {
                sourceLocation.lineNumber = this.getLineNumberOffsetByBreakpoints(sourceLocation.filePath, sourceLocation.lineNumber);
            }

            if (!sourceLocation?.filePath) {
                //couldn't find a source location. At least send back the staging file information so the user can still debug
                return {
                    filePath: stagingFileInfo.absolutePath,
                    lineNumber: sourceLocation?.lineNumber || debuggerLineNumber,
                    columnIndex: debuggerColumnNumber - 1
                } as SourceLocation;
            } else {
                return sourceLocation;
            }
        });
    }

    /**
     *
     * @param stagingDir - the path to
     */
    public async registerEntryBreakpoint(stagingDir: string) {
        //find the main function from the staging flder
        let entryPoint = await fileUtils.findEntryPoint(stagingDir);

        //convert entry point staging location to source location
        let sourceLocation = await this.getSourceLocation(entryPoint.relativePath, entryPoint.lineNumber);

        this.logger.info(`Registering entry breakpoint at ${sourceLocation.filePath}:${sourceLocation.lineNumber} (${entryPoint.pathAbsolute}:${entryPoint.lineNumber})`);
        //register the entry breakpoint
        this.breakpointManager.setBreakpoint(sourceLocation.filePath, {
            //+1 to select the first line of the function
            line: sourceLocation.lineNumber + 1
        });
    }

    /**
     * Given a debugger-relative file path, find the path to that file in the staging directory.
     * This supports the standard out dir, as well as component library out dirs
     * @param debuggerPath the path to the file which was provided by the debugger
     * @param stagingDir - the path to the root of the staging folder (where all of the files were copied before deployment)
     * @return a full path to the file in the staging directory
     */
    public async getStagingFileInfo(debuggerPath: string) {
        let project: Project;

        let componentLibraryIndex = fileUtils.getComponentLibraryIndexFromFileName(debuggerPath, componentLibraryPostfix);
        //component libraries
        if (componentLibraryIndex !== undefined) {
            let lib = this.componentLibraryProjects.find(x => x.libraryIndex === componentLibraryIndex);
            if (lib) {
                project = lib;
            } else {
                throw new Error(`There is no component library with index ${componentLibraryIndex}`);
            }
            //standard project files
        } else {
            project = this.mainProject;
        }

        let relativePath: string;

        //if the path starts with a scheme (i.e. pkg:/ or complib:/, we have an exact match.
        if (util.getFileScheme(debuggerPath)) {
            relativePath = util.removeFileScheme(debuggerPath);
        } else {
            relativePath = await fileUtils.findPartialFileInDirectory(debuggerPath, project.stagingDir);
        }
        if (relativePath) {
            relativePath = fileUtils.removeLeadingSlash(
                fileUtils.standardizePath(relativePath
                )
            );
            return {
                relativePath: relativePath,
                absolutePath: s`${project.stagingDir}/${relativePath}`,
                project: project
            };
        } else {
            return undefined;
        }
    }

    public dispose() {
        util.applyDispose(this.getAllProjects());
    }
}

export interface AddProjectParams {
    rootDir: string;
    outDir: string;
    packagePath?: string;
    sourceDirs?: string[];
    files: Array<FileEntry>;
    injectRaleTrackerTask?: boolean;
    raleTrackerTaskFileLocation?: string;
    injectRdbOnDeviceComponent?: boolean;
    rdbFilesBasePath?: string;
    bsConst?: Record<string, boolean>;
    stagingDir?: string;
    enhanceREPLCompletions: boolean;
}

export class Project {
    constructor(params: AddProjectParams) {
        assert(params?.rootDir, 'rootDir is required');
        this.rootDir = fileUtils.standardizePath(params.rootDir);

        assert(params?.outDir, 'outDir is required');
        this.outDir = fileUtils.standardizePath(params.outDir);
        this.stagingDir = params.stagingDir ?? rokuDeploy.getOptions(this).stagingDir;
        this.bsConst = params.bsConst;
        this.sourceDirs = (params.sourceDirs ?? [])
            //standardize every sourcedir
            .map(x => fileUtils.standardizePath(x));
        this.injectRaleTrackerTask = params.injectRaleTrackerTask ?? false;
        this.raleTrackerTaskFileLocation = params.raleTrackerTaskFileLocation;
        this.injectRdbOnDeviceComponent = params.injectRdbOnDeviceComponent ?? false;
        this.rdbFilesBasePath = params.rdbFilesBasePath;
        this.files = params.files ?? [];
        this.packagePath = params.packagePath;
        this.enhanceREPLCompletions = params.enhanceREPLCompletions;
    }
    public rootDir: string;
    public outDir: string;
    public packagePath: string;
    public sourceDirs: string[];
    public files: Array<FileEntry>;
    public stagingDir: string;
    public fileMappings: Array<{ src: string; dest: string }>;
    public bsConst: Record<string, boolean>;
    public injectRaleTrackerTask: boolean;
    public raleTrackerTaskFileLocation: string;
    public injectRdbOnDeviceComponent: boolean;
    public rdbFilesBasePath: string;
    public enhanceREPLCompletions: boolean;

    /**
     * A BrighterScript project for the stagingDir
     */
    private stagingBscProject = new BscProjectThreaded();

    //the default project doesn't have a postfix, but component libraries will have a postfix, so just use empty string to standardize the postfix logic
    public get postfix() {
        return '';
    }

    private logger = logger.createLogger(`[${ProjectManager.name}]`);

    public async stage() {
        let rd = new RokuDeploy();
        if (!this.fileMappings) {
            this.fileMappings = await this.getFileMappings();
        }

        //override the getFilePaths function so rokuDeploy doesn't run it again during prepublishToStaging
        (rd as any).getFilePaths = () => {
            let relativeFileMappings = [];
            for (let fileMapping of this.fileMappings) {
                relativeFileMappings.push({
                    src: fileMapping.src,
                    dest: fileUtils.replaceCaseInsensitive(fileMapping.dest, this.stagingDir, '')
                });
            }
            return Promise.resolve(relativeFileMappings);
        };

        //copy all project files to the staging folder
        await rd.prepublishToStaging({
            rootDir: this.rootDir,
            stagingDir: this.stagingDir,
            files: this.files,
            outDir: this.outDir
        });

        if (this.enhanceREPLCompletions) {
            //activate our background brighterscript ProgramBuilder now that the staging directory contains the final production project
            this.stagingBscProject.activate({
                rootDir: this.stagingDir,
                files: ['**/*'],
                watch: false,
                createPackage: false,
                deploy: false,
                copyToStaging: false,
                showDiagnosticsInConsole: false,
                logLevel: 'error',
                //this project is only used for file and scope lookups, so skip all validations since that takes a while and we don't care
                validate: false
            }).catch((e) => {
                this.logger.error('Error activating staging project.', e);
            });
        }

        //preload the original location of every file
        await this.resolveFileMappingsForSourceDirs();

        await this.transformManifestWithBsConst();

        await this.copyAndTransformRaleTrackerTask();

        await this.copyAndTransformRDB();
    }

    /**
     * Get all of the functions available for all scopes for this file.
     * @param relativePath path to the file relative to rootDir
     * @returns
     */
    public getScopeFunctionsForFile(relativePath: string) {
        if (this.enhanceREPLCompletions && this.stagingBscProject?.isActivated) {
            return this.stagingBscProject.getScopeFunctionsForFile({ relativePath: relativePath });
        } else {
            return [];
        }
    }

    /**
     * Get the range of the scope for the given position in the file
     * @param relativePath path to the file relative to rootDir
     * @param position the position in the file to get the scope range for
     */
    public async getScopeRange(relativePath: string, position: Position) {
        if (this.stagingBscProject?.isActivated) {
            return this.stagingBscProject.getScopeRange({ relativePath: relativePath, position: position });
        } else {
            return undefined;
        }
    }

    /**
     * If the project uses sourceDirs, replace every `fileMapping.src` with its original location in sourceDirs
     */
    private resolveFileMappingsForSourceDirs() {
        return Promise.all([
            this.fileMappings.map(async x => {
                let stagingFilePathRelative = fileUtils.getRelativePath(this.stagingDir, x.dest);
                let sourceDirFilePath = await fileUtils.findFirstRelativeFile(stagingFilePathRelative, this.sourceDirs);
                if (sourceDirFilePath) {
                    x.src = sourceDirFilePath;
                }
            })
        ]);
    }

    /**
     * Apply the bsConst transformations to the manifest file for this project
     */
    public async transformManifestWithBsConst() {
        if (this.bsConst) {
            let manifestPath = s`${this.stagingDir}/manifest`;
            if (await fsExtra.pathExists(manifestPath)) {
                // Update the bs_const values in the manifest in the staging folder before side loading the channel
                let fileContents = (await fsExtra.readFile(manifestPath)).toString();
                fileContents = this.updateManifestBsConsts(this.bsConst, fileContents);
                await fsExtra.writeFile(manifestPath, fileContents);
            }
        }
    }

    public updateManifestBsConsts(consts: Record<string, boolean>, fileContents: string): string {
        let bsConstLine: string;
        let missingConsts: string[] = [];
        let lines = fileContents.split(/\r?\n/g);

        let newLine: string;
        //loop through the lines until we find the bs_const line if it exists
        for (const line of lines) {
            if (line.toLowerCase().startsWith('bs_const')) {
                bsConstLine = line;
                newLine = line;
                break;
            }
        }

        if (bsConstLine) {
            // update the consts in the manifest and check for missing consts
            missingConsts = Object.keys(consts).reduce((results, key) => {
                let match = new RegExp('(' + key + '\\s*=\\s*[true|false]+[^\\S\\r\\n]*\)', 'i').exec(bsConstLine);
                if (match) {
                    newLine = newLine.replace(match[1], `${key}=${consts[key].toString()}`);
                } else {
                    results.push(key);
                }

                return results;
            }, []);

            // check for consts that where not in the manifest
            if (missingConsts.length > 0) {
                throw new Error(`The following bs_const keys were not defined in the channel's manifest:\n\n${missingConsts.join(',\n')}`);
            } else {
                // update the manifest contents
                return fileContents.replace(bsConstLine, newLine);
            }
        } else {
            throw new Error('bs_const was defined in the launch.json but not in the channel\'s manifest');
        }
    }

    public static RALE_TRACKER_TASK_CODE = `if true = CreateObject("roAppInfo").IsDev() then m.vscode_rale_tracker_task = createObject("roSGNode", "TrackerTask") ' Roku Advanced Layout Editor Support`;
    public static RALE_TRACKER_ENTRY = 'vscode_rale_tracker_entry';
    /**
     * Search the project files for the comment "' vscode_rale_tracker_entry" and replace it with the code needed to start the TrackerTask.
     */
    public async copyAndTransformRaleTrackerTask() {
        // inject the tracker task into the staging files if we have everything we need
        if (!this.injectRaleTrackerTask || !this.raleTrackerTaskFileLocation) {
            return;
        }
        try {
            await fsExtra.copy(this.raleTrackerTaskFileLocation, s`${this.stagingDir}/components/TrackerTask.xml`);
            this.logger.log('Tracker task successfully injected');
            // Search for the tracker task entry injection point
            const trackerReplacementResult = await replaceInFile({
                files: `${this.stagingDir}/**/*.+(xml|brs)`,
                from: new RegExp(`^.*'\\s*${Project.RALE_TRACKER_ENTRY}.*$`, 'mig'),
                to: (match: string) => {
                    // Strip off the comment
                    let startOfLine = match.substring(0, match.indexOf(`'`));
                    if (/[\S]/.exec(startOfLine)) {
                        // There was some form of code before the tracker entry
                        // append and use single line syntax
                        startOfLine += ': ';
                    }
                    return `${startOfLine}${Project.RALE_TRACKER_TASK_CODE}`;
                }
            });
            const injectedFiles = trackerReplacementResult
                .filter(result => result.hasChanged)
                .map(result => result.file);

            if (injectedFiles.length === 0) {
                console.error(`WARNING: Unable to find an entry point for Tracker Task.\nPlease make sure that you have the following comment in your BrightScript project: "\' ${Project.RALE_TRACKER_ENTRY}"`);
            }
        } catch (err) {
            console.error(err);
        }
    }

    public static RDB_ODC_NODE_CODE = `if true = CreateObject("roAppInfo").IsDev() then m.vscode_rdb_odc_node = createObject("roSGNode", "RTA_OnDeviceComponent") ' RDB OnDeviceComponent`;
    public static RDB_ODC_ENTRY = 'vscode_rdb_on_device_component_entry';
    /**
     * Search the project files for the RTA_ODC_ENTRY comment and replace it with the code needed to start RTA_OnDeviceComponent which is used by RDB.
     */
    public async copyAndTransformRDB() {
        // inject the on device component into the staging files if we have everything we need
        if (!this.injectRdbOnDeviceComponent || !this.rdbFilesBasePath) {
            return;
        }
        try {
            let files = await globAsync(`${this.rdbFilesBasePath}/**/*`, {
                cwd: './',
                absolute: false,
                follow: true
            });
            for (let filePathAbsolute of files) {
                const promises = [];
                //only include files (i.e. skip directories)
                if (await util.isFile(filePathAbsolute)) {
                    const relativePath = s`${filePathAbsolute}`.replace(s`${this.rdbFilesBasePath}`, '');
                    const destinationPath = s`${this.stagingDir}/${relativePath}`;
                    promises.push(fsExtra.copy(filePathAbsolute, destinationPath));
                }
                await Promise.all(promises);
                this.logger.log('RDB OnDeviceComponent successfully injected');
            }

            // Search for the tracker task entry injection point
            const replacementResult = await replaceInFile({
                files: `${this.stagingDir}/**/*.+(xml|brs)`,
                from: new RegExp(`^.*'\\s*${Project.RDB_ODC_ENTRY}.*$`, 'mig'),
                to: (match: string) => {
                    // Strip off the comment
                    let startOfLine = match.substring(0, match.indexOf(`'`));
                    if (/[\S]/.exec(startOfLine)) {
                        // There was some form of code before the tracker entry
                        // append and use single line syntax
                        startOfLine += ': ';
                    }
                    return `${startOfLine}${Project.RDB_ODC_NODE_CODE}`;
                }
            });
            const injectedFiles = replacementResult
                .filter(result => result.hasChanged)
                .map(result => result.file);

            if (injectedFiles.length === 0) {
                console.error(`WARNING: Unable to find an entry point for RDB.\nPlease make sure that you have the following comment in your BrightScript project: "\' ${Project.RDB_ODC_ENTRY}"`);
            }
        } catch (err) {
            console.error(err);
        }
    }

    /**
     *
     * @param stagingPath
     */
    public async zipPackage(params: { retainStagingFolder: boolean }) {
        const options = rokuDeploy.getOptions({
            ...this,
            ...params
        });

        let packagePath = this.packagePath;
        if (!this.packagePath) {
            //make sure the output folder exists
            await fsExtra.ensureDir(options.outDir);

            packagePath = rokuDeploy.getOutputZipFilePath(options);
        }

        //ensure the manifest file exists in the staging folder
        if (!await rokuDeployUtil.fileExistsCaseInsensitive(`${options.stagingDir}/manifest`)) {
            throw new Error(`Cannot zip package: missing manifest file in "${options.stagingDir}"`);
        }

        // create a zip of the staging folder
        await rokuDeploy.zipFolder(options.stagingDir, packagePath, undefined, [
            '**/*',
            //exclude sourcemap files (they're large and can't be parsed on-device anyway...)
            '!**/*.map'
        ]);

        //delete the staging folder unless told to retain it.
        if (options.retainStagingDir !== true) {
            await fsExtra.remove(options.stagingDir);
        }
    }

    /**
     * Get the file paths from roku-deploy, and ensure the dest paths are absolute
     * (`dest` paths are relative in later versions of roku-deploy)
     */
    protected async getFileMappings() {
        let fileMappings = await rokuDeploy.getFilePaths(this.files, this.rootDir);
        for (let mapping of fileMappings) {
            //if the dest path is relative, make it absolute (relative to the staging dir)
            mapping.dest = path.resolve(this.stagingDir, mapping.dest);
            //standardize the paths once here, and don't need to do it again anywhere else in this project
            mapping.src = fileUtils.standardizePath(mapping.src);
            mapping.dest = fileUtils.standardizePath(mapping.dest);
        }
        return fileMappings;
    }

    public dispose() {
        this.stagingBscProject?.dispose?.();
    }
}

export interface RemoteLibraryConstructorParams extends AddProjectParams {
    outFile: string;
    libraryIndex: number;
    host?: string;
    username?: string;
    password?: string;
    libType?: 'remote' | 'channelstore' | 'other';
}

export class RemoteComponentLibraryProject extends Project {
    constructor(params: RemoteLibraryConstructorParams) {
        super(params);
        this.outFile = params.outFile;
        this.libraryIndex = params.libraryIndex;
        this.libType = params.libType ||'channelstore';
        this.host = params.host;
        this.username = params.username;
        this.password = params.password;
    }
    public outFile: string;
    public libraryIndex: number;
    /**
     * The name of the component library that this project represents. This is loaded during `this.computeOutFileName`
     */
    public name: string;

    public libType: string;
    public host: string;
    public password: string;
    public username: string;

    /**
     * Takes a component Library and checks the outFile for replaceable values pulled from the libraries manifest
     * @param manifestPath the path to the manifest file to check
     */
    private async computeOutFileName(manifestPath: string) {
        let regexp = /\$\{([\w\d_]*)\}/;
        let renamingMatch: RegExpExecArray;
        let manifestValues = await util.convertManifestToObject(manifestPath);
        if (!manifestValues) {
            throw new Error(`Cannot find manifest file at "${manifestPath}"\n\nCould not complete automatic component library naming.`);
        }

        //load the component libary name from the manifest
        this.name = manifestValues.sg_component_libs_provided;

        // search the outFile for replaceable values such as ${title}
        while ((renamingMatch = regexp.exec(this.outFile))) {

            // replace the replaceable key with the manifest value
            let manifestVariableName = renamingMatch[1];
            let manifestVariableValue = manifestValues[manifestVariableName];
            if (manifestVariableValue) {
                this.outFile = this.outFile.replace(renamingMatch[0], manifestVariableValue);
            } else {
                throw new Error(`Cannot find manifest value:\n"${manifestVariableName}"\n\nCould not complete automatic component library naming.`);
            }
        }
    }

    public async setComponentLibraryName() {
        this.fileMappings = await this.getFileMappings();

        let expectedManifestDestPath = fileUtils.standardizePath(`${this.stagingDir}/manifest`).toLowerCase();
        //find the file entry with the `dest` value of `${stagingDir}/manifest` (case insensitive)
        let manifestFileEntry = this.fileMappings.find(x => x.dest.toLowerCase() === expectedManifestDestPath);
        if (manifestFileEntry) {
            //read the manifest from `src` since nothing has been copied to staging yet
            await this.computeOutFileName(manifestFileEntry.src);
        } else {
            throw new Error(`Could not find manifest path for component library at '${this.rootDir}'`);
        }
    }

    public async stage() {
        /*
         Compute the file mappings now (i.e. don't let the parent class compute them).
         This must be done BEFORE finding the manifest file location.
         */
        this.fileMappings = await this.getFileMappings();

        await this.setComponentLibraryName();

        if(this.libType) {
            const rd = new RokuDeploy();
            util.log(`Staging for ${this.libType}`);
            let prevStagingDir = this.stagingDir;
            // copy to out directory to show breakpoint
            this.stagingDir = s`${this.outDir}/../.roku-deploy-staging`;
            await rd.prepublishToStaging({
                rootDir: this.rootDir,
                stagingDir: this.stagingDir,
                files: this.files,
                outDir: this.outDir
            });
    
            this.stagingDir = prevStagingDir;
            await rd.prepublishToStaging({
                rootDir: this.rootDir,
                stagingDir: this.stagingDir,
                files: this.files,
                outDir: this.outDir
            });
        } else {
            let fileNameWithoutExtension = path.basename(this.outFile, path.extname(this.outFile));
    
            let defaultStagingDir = this.stagingDir;
    
            //compute the staging folder path.
            this.stagingDir = s`${this.outDir}/${fileNameWithoutExtension}`;
    
            /*
              The fileMappings were created using the default stagingDir (because we need the manifest path
              to compute the out file name and staging path), so we need to replace the default stagingDir
              with the actual stagingDir.
             */
            for (let fileMapping of this.fileMappings) {
                fileMapping.dest = fileUtils.replaceCaseInsensitive(fileMapping.dest, defaultStagingDir, this.stagingDir);
            }
    
            return super.stage();
        }
    }

    /**
     * The text used as a postfix for every brs file so we can accurately track the location of the files
     * back to their original component library whenever the debugger truncates the file path.
     */
    public get postfix() {

        return this.libType? '' : `${componentLibraryPostfix}${this.libraryIndex}`;
    }

    public async postfixFiles() {
        if (this.libType) return;

        let pathDetails = {};
        await Promise.all(this.fileMappings.map(async (fileMapping) => {
            let relativePath = fileUtils.removeLeadingSlash(
                fileUtils.getRelativePath(this.stagingDir, fileMapping.dest)
            );
            let postfixedPath = fileUtils.postfixFilePath(relativePath, this.postfix, ['.brs']);
            if (postfixedPath !== relativePath) {
                // Rename the brs files to include the postfix namespacing tag
                await fsExtra.move(fileMapping.dest, path.join(this.stagingDir, postfixedPath));
                // Add to the map of original paths and the new paths
                pathDetails[postfixedPath] = relativePath;
            }
        }));

        // Update all the file name references in the library to the new file names
        await replaceInFile({
            files: [
                path.join(this.stagingDir, '**/*.xml'),
                path.join(this.stagingDir, '**/*.brs')
            ],
            from: /uri\s*=\s*"(.+)\.brs"/gi,
            to: (match: string) => {
                // only alter file ending if it is a) pkg:/ url or b) relative url
                let isPkgUrl = !!/^uri\s*=\s*"pkg:\//i.exec(match);
                let isRelativeUrl = !/:\//i.exec(match);
                if (isPkgUrl || isRelativeUrl) {
                    return match.replace('.brs', this.postfix + '.brs');
                } else {
                    return match;
                }
            }
        });
    }

    public async publish() {
        if(this.libType){
            if(this.libType !== 'channelstore') {
                util.log(`No publish for libType: ${this.libType}`)
                return;
            } 

            const options = rokuDeploy.getOptions({
                ...this,
                username: this.username || "rokudev",
                libType: 'dcl', // this would run only for DCL type & rokuDeploy expects dcl not channelstore
            });

            await rokuDeploy.publish(options).then(function(){
            }, function(error) {
                util.log(`Error during sideloading: ${error}`);
            });
        }
    }
}

