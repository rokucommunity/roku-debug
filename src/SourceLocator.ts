import * as fsExtra from 'fs-extra';
import { SourceMapConsumer } from 'source-map';
import * as path from 'path';
import { fileUtils } from './FileUtils';
import { fileManager } from './managers/FileManager';
import { sourceMapManager } from './managers/SourceMapManager';
/**
 * Find original source locations based on debugger/staging locations.
 */
export class SourceLocator {
    /**
     * Given a debugger/staging location, convert that to a source location
     */
    public async getSourceLocation(options: SourceLocatorOptions): Promise<SourceLocation> {
        let rootDir = fileUtils.standardizePath(options.rootDir);
        let stagingFolderPath = fileUtils.standardizePath(options.stagingFolderPath);
        let currentFilePath = fileUtils.standardizePath(options.stagingFilePath);
        let sourceDirs = options.sourceDirs ? options.sourceDirs.map(x => fileUtils.standardizePath(x)) : [];
        //throw out any sourceDirs pointing the rootDir
        sourceDirs = sourceDirs.filter(x => x !== rootDir);

        //look for a sourcemap for this file (if source maps are enabled)
        if (options?.enableSourceMaps !== false) {
            let sourceLocation = await sourceMapManager.getOriginalLocation(
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
                sourceMapManager.sourceMapExists(`${sourceLocation.filePath}.map`)
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

}

export interface SourceLocatorOptions {
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
