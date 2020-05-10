import * as fsExtra from 'fs-extra';
import { util } from '../util';
import { RawSourceMap } from 'source-map';
import { fileUtils } from '../FileUtils';
import * as path from 'path';

/**
 * Unifies access to source files across the whole project
 */
export class FileManager {
    /**
     * A map of file lines, indexed by file path
     */
    private cache = {} as {
        /**
         * Store all paths in lower case since Roku is case-insensitive
         */
        [lowerFilePath: string]: CodeFile;
    };

    /**
     * Clears the in-memory file cache
     */
    public reset() {
        this.cache = {};
    }

    public getCodeFile(filePath: string) {
        let lowerFilePath = filePath.toLowerCase();
        if (!this.cache[lowerFilePath]) {
            let fileInfo = {
                lines: [],
                functionNameMap: {}
            } as CodeFile;

            try {
                let fileContents = fsExtra.readFileSync(filePath).toString();
                fileInfo.lines = fileContents.split(/\r?\n/);
                fileInfo.functionNameMap = this.getFunctionNameMap(fileContents);
            } catch (e) {
                util.logDebug(`Error loading file: '${filePath}'`, JSON.stringify(e));
            }
            this.cache[lowerFilePath] = fileInfo;
        }
        return this.cache[lowerFilePath] as CodeFile;
    }

    /**
     * Given the text of a file, find all of the function names
     */
    private getFunctionNameMap(fileContents: string) {
        let regexp = /^\s*(?:sub|function)\s+([a-z0-9_]+)/gim;
        let match: RegExpMatchArray;

        let result = {};

        //create a cache of all function names in this file
        while (match = regexp.exec(fileContents)) {
            let correctFunctionName = match[1];
            result[correctFunctionName.toLowerCase()] = correctFunctionName;
        }
        return result;
    }

    /**
     * The stacktrace sent by Roku forces all BrightScript function names to lower case.
     * This function will scan the source file, and attempt to find the exact casing from the function definition.
     * Also, this function caches results, so it should be faster than the previous implementation
     * which read the source file from the file system on each call
     */
    public getCorrectFunctionNameCase(sourceFilePath: string, functionName: string) {
        let fileInfo = this.getCodeFile(sourceFilePath);
        return fileInfo?.functionNameMap[functionName.toLowerCase()] ?? functionName;
    }
}

export interface CodeFile {
    lines: string[];
    //map of lower case function name to its actual case in the source file
    functionNameMap: { [lowerFunctionName: string]: string };
}

export const fileManager = new FileManager();