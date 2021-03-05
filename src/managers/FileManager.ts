import * as fsExtra from 'fs-extra';
import { util } from '../util';
import { Position, Range } from 'vscode-languageserver';

/**
 * Unifies access to source files across the whole project
 */
export class FileManager {
    /**
     * A map of file lines, indexed by file path
     * Store all paths in lower case since Roku is case-insensitive
     */
    private cache = {} as Record<string, CodeFile>;

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
                fileInfo.functionInfo = this.getFunctionInfo(fileInfo.lines);
                fileInfo.functionNameMap = this.getFunctionNameMap(fileContents);
            } catch (e) {
                util.logDebug(`Error loading file: '${filePath}'`, JSON.stringify(e));
            }
            this.cache[lowerFilePath] = fileInfo;
        }
        return this.cache[lowerFilePath];
    }

    private getFunctionInfo(lines: string[]) {
        let result = [];

        let functionStack = [] as FunctionInfo[];
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            let line = lines[lineIndex];
            let functionName: string;
            let openers = [
                //function declaration
                /^\s*(?:public|private|protected)?\s*(?:override)?\s*(?:sub|function)\s+([a-z0-9_]+)/gim,
                //function in object
                /"?([a-z0-9_]+)"?:\s*(?:sub|function)/gim,
                //function in basic assignment
                /([a-z0-9_]+)\s*=\s*(?:sub|function)/gim,
                //all other functions (we won't know the name but we'll be in a stable state)
                /\b(?:sub|function)\s*\(/gim
            ];
            for (let opener of openers) {
                let match = opener.exec(line);
                if (match) {
                    functionName = match[1];
                    functionStack.push({
                        name: match[1],
                        children: [],
                        range: Range.create(
                            lineIndex,
                            0, //TODO determine the char for this range,
                            -1,
                            -1
                        )
                    });
                    break;
                }
            }

            let closers = [
                /^\s*end\s*(?:sub|function)/gim
            ];
            for (let closer of closers) {
                let match = closer.exec(line);
                if (match) {
                    let func = functionStack.pop();
                    //if we didn't find a function on the stack, something went terribly wrong. scrap all of the results
                    if (!func) {
                        return [];
                    }
                    func.range = Range.create(
                        func.range.start,
                        Position.create(lineIndex, Number.MAX_SAFE_INTEGER)
                    );
                    //if there's a parent function, register this function as a child
                    if (functionStack.length > 0) {
                        functionStack[functionStack.length - 1].children.push(func);
                    } else {
                        //this is a top-level function
                        result.push(func);
                    }
                    break;
                }
            }
        }
        return result;
    }

    /**
     * Given the text of a file, find all of the function names
     */
    private getFunctionNameMap(fileContents: string) {
        let regexp = /^\s*(?:sub|function)\s+([a-z0-9_]+)/gim;
        let match: RegExpExecArray;

        let result = {};

        //create a cache of all function names in this file
        // eslint-disable-next-line no-cond-assign
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
     * @param sourceFilePath the path to the source file
     * @param rootDir the rootDir of the staged running program. This is used to assist the BrighterScript parser for certain file operations
     * @param functionName the name of the function to translate to the correct case
     */
    public getCorrectFunctionNameCase(sourceFilePath: string, functionName: string) {
        let fileInfo = this.getCodeFile(sourceFilePath);
        return fileInfo.functionNameMap[functionName.toLowerCase()] ?? functionName;
    }

    /**
     * Find the function at the given position
     */
    private getFunctionInfoAtPosition(position: Position, functionInfos?: FunctionInfo[]): FunctionInfo {
        for (let info of functionInfos) {
            if (util.rangeContains(info.range, position)) {
                //see if any of this function's children match the position also, and give them priority
                let childInfo = this.getFunctionInfoAtPosition(position, info.children);
                if (childInfo) {
                    return childInfo;
                } else {
                    return info;
                }
            }
        }
    }

    /**
     * Anonymous functions have obscure names. In most cases, we can derive a slightly better name
     * from the source code.
     * @param sourceFilePath the path to the source file
     * @param lineIndex the zero-indexed line number from the debugger
     */
    public getFunctionNameAtPosition(sourceFilePath: string, lineIndex: number, functionName: string) {
        let fileInfo = this.getCodeFile(sourceFilePath);
        let functionInfo = this.getFunctionInfoAtPosition(Position.create(lineIndex, 0), fileInfo.functionInfo);
        if (functionInfo) {
            functionName = functionInfo.name;
        }
        return functionName;
    }
}

export interface CodeFile {
    lines: string[];
    /**
     * Map of lower case function name to its actual case in the source file
     */
    functionNameMap: Record<string, string>;
    /**
     * An array of function information from this file
     */
    functionInfo: FunctionInfo[];
}

interface FunctionInfo {
    name: string;
    children: FunctionInfo[];
    range: Range;
}
