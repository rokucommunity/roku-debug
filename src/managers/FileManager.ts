import * as fsExtra from 'fs-extra';
import { util } from '../util';

/**
 * Unifies access to source files across the whole project
 */
export class FileManager {
    /**
     * A map of file lines, indexed by file path
     */
    private cache = {} as {
        /**
         * since Roku uses a case insensitive file path, 
         * we store the file path in lower case too
         */
        [lowerFilePath: string]: FileInfo
    }

    public getFile(filePath: string) {
        let lowerFilePath = filePath.toLowerCase();
        if (!this.cache[lowerFilePath]) {
            let fileInfo = {
                lines: [],
                functionNameMap: {}
            } as FileInfo;

            try {
                let fileContents = fsExtra.readFileSync(filePath).toString();
                fileInfo.lines = fileContents.split(/\r?\n/);
                fileInfo.functionNameMap = this.getFunctionNameMap(fileContents);
            } catch (e) {
                util.logDebug(`Error loading file: '${filePath}'`, JSON.stringify(e));
            }
            this.cache[lowerFilePath] = fileInfo;
        }
        return this.cache[lowerFilePath];
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
     * Get a line in a file.
     * @param filePath the absolute path to the file
     * @param lineIndex the zero-indexed line index
     * @return undefined if the file or the line doesn't exist.
     */
    public async getLine(filePath: string, lineIndex: number) {
        let file = this.getFile(filePath);

        return this.cache[filePath][lineIndex];
    }

    /**
     * Get the first non-whitespace token in the file starting at the given position
     * @param filePath the absolute path to the file
     * @param lineIndex the zero-indexed line position
     * @param columnIndex the zero-indexed column position
     */
    public getFirstNonWhitespaceToken(filePath: string, lineIndex: number, columnIndex?: number) {
        let line = this.getLine(filePath, lineIndex);
    }

    /**
     * The stacktrace sent by Roku forces all BrightScript function names to lower case.
     * This function will scan the source file, and attempt to find the exact casing from the function definition.
     * Also, this function caches results, so it should be faster than the previous implementation
     * which read the source file from the file system on each call
     */
    public getCorrectFunctionNameCase(sourceFilePath: string, functionName: string) {
        let fileInfo = this.getFile(sourceFilePath);
        return fileInfo?.functionNameMap[functionName.toLowerCase()] ?? functionName;
    }

}

interface FileInfo {
    lines: string[];
    //map of lower case function name to its actual case in the source file
    functionNameMap: { [lowerFunctionName: string]: string };
}
