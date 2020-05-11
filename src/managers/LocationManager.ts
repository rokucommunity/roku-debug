import * as fsExtra from 'fs-extra';
import { SourceMapConsumer } from 'source-map';
import * as path from 'path';
import { fileUtils } from '../FileUtils';
import { SourceMapManager } from './SourceMapManager';
import * as glob from 'glob';

/**
 * Find original source locations based on debugger/staging locations.
 */
export class LocationManager {
    constructor(
        private sourceMapManager: SourceMapManager
    ) {

    }
    /**
     * Given a debugger/staging location, convert that to a source location
     */
    public async getSourceLocation(options: GetSourceLocationOptions): Promise<SourceLocation> {
        let rootDir = fileUtils.standardizePath(options.rootDir);
        let stagingFolderPath = fileUtils.standardizePath(options.stagingFolderPath);
        let currentFilePath = fileUtils.standardizePath(options.stagingFilePath);
        let sourceDirs = options.sourceDirs ? options.sourceDirs.map(x => fileUtils.standardizePath(x)) : [];
        //throw out any sourceDirs pointing the rootDir
        sourceDirs = sourceDirs.filter(x => x !== rootDir);

        //look for a sourcemap for this file (if source maps are enabled)
        if (options?.enableSourceMaps !== false) {
            let sourceLocation = await this.sourceMapManager.getOriginalLocation(
                currentFilePath,
                options.lineNumber,
                options.columnIndex
            );
            //follow the source map trail backwards another level
            if (
                //if the sourcemap points to a new location on disk
                sourceLocation?.filePath &&
                //prevent circular dependencies by stopping if we have already seen this path before
                !options._sourceChain?.includes(sourceLocation.filePath) &&
                //there is a source map for that new location
                this.sourceMapManager.sourceMapExists(`${sourceLocation.filePath}.map`)
            ) {
                let nextLevelSourceLocation = await this.getSourceLocation({
                    ...options,
                    //push current file to the source chain to prevent circular dependencies
                    _sourceChain: [
                        ...options._sourceChain ?? [],
                        currentFilePath
                    ],
                    columnIndex: sourceLocation.columnIndex,
                    lineNumber: sourceLocation.lineNumber,
                    stagingFilePath: sourceLocation.filePath
                });
                sourceLocation = nextLevelSourceLocation ?? sourceLocation;
            }

            if (sourceLocation) {
                return sourceLocation;
            }
        }

        //if we have sourceDirs, rootDir is the project's OUTPUT folder, so skip looking for files there, and
        //instead walk backwards through sourceDirs until we find the file we want
        if (sourceDirs.length > 0) {
            let relativeFilePath = fileUtils.getRelativePath(stagingFolderPath, currentFilePath);
            let sourceDirsFilePath = await fileUtils.findFirstRelativeFile(relativeFilePath, sourceDirs);
            //if we found a file in one of the sourceDirs, use that
            if (sourceDirsFilePath) {
                return {
                    filePath: sourceDirsFilePath,
                    lineNumber: options.lineNumber,
                    columnIndex: options.columnIndex
                };
            }
        }

        //no sourceDirs and no sourceMap. assume direct file copy using roku-deploy.
        if (!options.fileMappings) {
            throw new Error('fileMappings cannot be undefined');
        }
        let lowerFilePathInStaging = currentFilePath.toLowerCase();
        let fileEntry = options.fileMappings.find(x => {
            return fileUtils.standardizePath(x.dest.toLowerCase()) === lowerFilePathInStaging;
        });

        if (fileEntry && await fsExtra.pathExists(fileEntry.src)) {
            return {
                filePath: fileEntry.src,
                lineNumber: options.lineNumber,
                columnIndex: options.columnIndex
            };
        }
        return undefined;
    }

     /**
     * Given a source location, compute its locations in staging. You should call this for the main app (rootDir, rootDir+sourceDirs),
     * and also once for each component library.
     * There is a possibility of a single source location mapping to multiple staging locations (i.e. merging a function into two different files),
     * So this will return an array of locations.
     */
    public async getStagingLocations(
        sourceFilePath: string,
        sourceLineNumber: number,
        sourceColumnIndex: number,
        sourceDirs: string[],
        stagingFolderPath: string
    ): Promise<{ type: 'sourceMap' | 'sourceDirs', locations: SourceLocation[] }> {

        sourceFilePath = fileUtils.standardizePath(sourceFilePath);
        sourceDirs = sourceDirs.map(x => fileUtils.standardizePath(x));
        stagingFolderPath = fileUtils.standardizePath(stagingFolderPath);

        //look through the sourcemaps in the staging folder for any instances of this source location
        let locations = await this.sourceMapManager.getGeneratedLocations(
            glob.sync('**/*.map', {
                cwd: stagingFolderPath,
                absolute: true
            }),
            {
                filePath: sourceFilePath,
                lineNumber: sourceLineNumber,
                columnIndex: sourceColumnIndex
            }
        );

        if (locations.length > 0) {
            return {
                type: 'sourceMap',
                locations: locations
            };

            //no sourcemaps were found that reference this file.
            //walk look through each sourceDir in order, computing the relative path for the file, and
            //comparing that relative path to the relative path in the staging directory
            //so look for a file with the same relative location in the staging folder
        } else {

            //compute the relative path for this file
            let parentFolderPath = fileUtils.findFirstParent(sourceFilePath, sourceDirs);
            if (parentFolderPath) {
                let relativeFilePath = fileUtils.replaceCaseInsensitive(sourceFilePath, parentFolderPath, '');
                let stagingFilePathAbsolute = path.join(stagingFolderPath, relativeFilePath);
                return {
                    type: 'sourceDirs',
                    locations: [{
                        filePath: stagingFilePathAbsolute,
                        columnIndex: sourceColumnIndex,
                        lineNumber: sourceLineNumber
                    }]
                };
            } else {
                //return an empty array so the result is still iterable
                return {
                    type: 'sourceDirs',
                    locations: []
                };
            }
        }
    }

}

export interface GetSourceLocationOptions {
    /**
     * The absolute path to the staging folder
     */
    stagingFolderPath: string;

    /**
     * The absolute path to the file in the staging folder
     */
    stagingFilePath: string;

    /**
     * The absolute path to the root directory
     */
    rootDir: string;
    /**
     *  An array of sourceDir paths
     */
    sourceDirs?: string[];
    /**
     * The result of rokuDeploy.getFilePaths(). This is passed in so it can be cached on the outside in order to improve performance
     */
    fileMappings: { src: string; dest: string }[];
    /**
     * The debugger line number (1-based)
     */
    lineNumber: number;
    /**
     * The debugger column index (0-based)
     */
    columnIndex: number;
    /**
     * If true, then use source maps as part of the process
     */
    enableSourceMaps: boolean;
    /**
     * Used to prevent circular references. This is set by the function so do not set this value yourself
     */
    _sourceChain?: string[];
}

export interface SourceLocation {
    /**
     * The path to the file in the source location
     */
    filePath: string;
    /**
     * 1-based line number
     */
    lineNumber: number;
    /**
     * 0-based column index
     */
    columnIndex: number;
}
