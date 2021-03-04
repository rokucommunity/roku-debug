import * as fsExtra from 'fs-extra';
import { util } from '../util';
import type { RawSourceMap } from 'source-map';
import { SourceMapConsumer } from 'source-map';
import { standardizePath as s, fileUtils } from '../FileUtils';
import * as path from 'path';
import type { SourceLocation } from './LocationManager';
/**
 * Unifies access to source files across the whole project
 */
export class SourceMapManager {
    /**
    * Store all paths in lower case since Roku is case-insensitive.
    * If the file existed, but something failed during parsing, this will be set to null.
    * So take that into consideration when deciding to use falsey checking
    */
    private cache = {} as Record<string, RawSourceMap | null>;

    /**
     * Does a source map exist at the specified path?
     * Checks the local cache first to prevent hitting the file system,
     * then falls back to the file system if not in the cache
     */
    public sourceMapExists(sourceMapPath: string) {
        let key = s`${sourceMapPath.toLowerCase()}`;
        let map = this.cache[key];
        if (map !== undefined && map !== null) {
            return true;
        }
        let existsOnDisk = fsExtra.pathExistsSync(sourceMapPath);
        return existsOnDisk;
    }

    /**
     * Get a parsed source map, with all of its paths already resolved
     */
    public async getSourceMap(sourceMapPath: string) {
        let key = s`${sourceMapPath.toLowerCase()}`;
        if (this.cache[key] === undefined) {
            let parsedSourceMap: RawSourceMap;
            if (await fsExtra.pathExists(sourceMapPath)) {
                try {
                    let contents = (await fsExtra.readFile(sourceMapPath)).toString();
                    this.set(sourceMapPath, contents);
                } catch (e) {
                    util.logDebug(`Error loading or parsing source map for '${sourceMapPath}'`, e);
                }
            }
        }
        return this.cache[key];
    }

    /**
     * Update the in-memory cache for a specific source map,
     * and resolve the sources list to absolute paths
     */
    public set(sourceMapPath: string, sourceMap: string) {
        let key = s`${sourceMapPath.toLowerCase()}`;
        try {
            let parsedSourceMap = JSON.parse(sourceMap) as RawSourceMap;
            //remove the file from cache
            delete this.cache[key];
            //standardize the source map paths
            parsedSourceMap.sources = parsedSourceMap.sources.map(source => fileUtils.standardizePath(
                path.resolve(
                    //use the map's sourceRoot, or the map's folder path (to support relative paths)
                    parsedSourceMap.sourceRoot || path.dirname(sourceMapPath),
                    source
                )
            ));
            this.cache[key] = parsedSourceMap;
        } catch (e) {
            this.cache[key] = null;
            throw e;
        }
    }

    /**
     * Get the source location of a position using a source map. If no source map is found, undefined is returned
     * @param filePath - the absolute path to the file
     * @param currentLineNumber - the 1-based line number of the current location.
     * @param currentColumnIndex - the 0-based column number of the current location.
     */
    public async getOriginalLocation(filePath: string, currentLineNumber: number, currentColumnIndex = 0): Promise<SourceLocation> {
        //look for a source map for this file
        let sourceMapPath = `${filePath}.map`;

        //if we have a source map, use it
        if (await fsExtra.pathExists(sourceMapPath)) {
            let parsedSourceMap = await this.getSourceMap(sourceMapPath);
            if (parsedSourceMap) {
                let position = await SourceMapConsumer.with(parsedSourceMap, null, (consumer) => {
                    return consumer.originalPositionFor({
                        line: currentLineNumber,
                        column: currentColumnIndex,
                        bias: SourceMapConsumer.LEAST_UPPER_BOUND
                    });
                });
                if (position?.source) {
                    return {
                        columnIndex: position.column,
                        lineNumber: position.line,
                        filePath: position.source
                    };
                }
                //if the sourcemap didn't find a valid mapped location,
                //try to fallback to the first source referenced in the map
                if (parsedSourceMap.sources?.[0]) {
                    return {
                        columnIndex: currentColumnIndex,
                        lineNumber: currentLineNumber,
                        filePath: parsedSourceMap.sources[0]
                    };
                } else {
                    return undefined;
                }
            }
        }
    }

    /**
     * Given a source location, find the generated location using source maps
     */
    public async getGeneratedLocations(sourceMapPaths: string[], sourceLocation: SourceLocation) {
        let sourcePath = fileUtils.standardizePath(sourceLocation.filePath);
        let locations = [] as SourceLocation[];

        //search through every source map async
        await Promise.all(sourceMapPaths.map(async (sourceMapPath) => {
            try {
                sourceMapPath = fileUtils.standardizePath(sourceMapPath);
                let parsedSourceMap = await this.getSourceMap(sourceMapPath);

                //if the source path was found in the sourceMap, convert the source location into a target location
                if (parsedSourceMap?.sources.includes(sourcePath)) {
                    let position = await SourceMapConsumer.with(parsedSourceMap, null, (consumer) => {
                        return consumer.generatedPositionFor({
                            line: sourceLocation.lineNumber,
                            column: sourceLocation.columnIndex,
                            source: fileUtils.standardizePath(sourceLocation.filePath),
                            //snap to the NEXT item if the current position could not be found
                            bias: SourceMapConsumer.LEAST_UPPER_BOUND
                        });
                    });

                    if (position) {
                        locations.push({
                            lineNumber: position.line,
                            columnIndex: position.column,
                            filePath: sourceMapPath.replace(/\.map$/g, '')
                        });
                    }
                }
            } catch (e) {
                util.logDebug(new Error('Error converting source location to staging location'), e);
            }
        }));
        return locations;
    }
}
