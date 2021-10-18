import * as dateFormat from 'dateformat';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as net from 'net';
import * as url from 'url';
import type { SmartBuffer } from 'smart-buffer';
import type { BrightScriptDebugSession } from './debugSession/BrightScriptDebugSession';
import { DebugServerLogOutputEvent, LogOutputEvent } from './debugSession/Events';
import type { BrightScriptDebugCompileError } from './CompileErrorProcessor';
import { GENERAL_XML_ERROR } from './CompileErrorProcessor';
import type { Position, Range, AssignmentStatement } from 'brighterscript';
import { Parser, DiagnosticSeverity, isVariableExpression, isDottedGetExpression, isIndexedGetExpression, isLiteralExpression } from 'brighterscript';

class Util {
    /**
     * If the path does not have a trailing slash, one is appended to it
     * @param dirPath
     */
    public ensureTrailingSlash(dirPath: string) {
        return dirPath.substr(dirPath.length - 1) !== '/' ? dirPath + '/' : dirPath;
    }

    /**
     * Determine if a file exists
     * @param filePath
     */
    public fileExists(filePath: string) {
        return new Promise((resolve) => {
            fsExtra.exists(filePath, resolve);
        });
    }

    /**
     * Determines if the given path is a file
     * @param filePathAbsolute
     */
    public async isFile(filePathAbsolute: string) {
        try {
            //get the full path to the file. This should be the same path for files, and the actual path for any symlinks
            let realPathAbsolute = fs.realpathSync(filePathAbsolute);
            let stat = await fsExtra.lstat(realPathAbsolute);
            return stat.isFile();
        } catch (e) {
            // lstatSync throws an error if path doesn't exist
            return false;
        }
    }

    /**
     * Removes any leading scheme in the file path
     * @param filePath
     */
    public removeFileScheme(filePath: string): string {
        let scheme = this.getFileScheme(filePath);
        if (scheme) {
            return filePath.substring(scheme.length);
        } else {
            return filePath;
        }
    }

    /**
     * Gets any leading scheme in the file path
     * @param filePath
     */
    public getFileScheme(filePath: string): string | null {
        return url.parse(filePath).protocol;
    }

    /**
     * Remove a single trailing newline from a string (\n or \r\n)
     */
    public removeTrailingNewline(value: string) {
        return value.replace(/(.*?)\r?\n$/, '$1');
    }

    /**
     * Reads the the manifest file and converts to a javascript object skipping empty lines and comments
     * @param path location of the manifest file
     */
    public async convertManifestToObject(path: string): Promise<Record<string, string> | undefined> {
        if (await this.fileExists(path) === false) {
            return undefined;
        } else {
            let fileContents = (await fsExtra.readFile(path)).toString();
            let manifestLines = fileContents.split('\n');

            let manifestValues = {};
            for (const line of manifestLines) {
                let match = /(\w+)=(.+)/.exec(line);
                if (match) {
                    manifestValues[match[1]] = match[2];
                }
            }

            return manifestValues;
        }
    }

    /**
     * Checks to see if the port is already in use
     * @param port target port to check
     */
    public async isPortInUse(port: number): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const tester = net.createServer()
                .once('error', (err: any) => {
                    if (err.code === 'EADDRINUSE') {
                        resolve(true);
                    } else {
                        reject(err);
                    }
                })
                .once('listening', () => tester.once('close', () => {
                    resolve(false);
                }).close())
                .listen(port);
        });
    }

    /**
     * With return the differences in two objects
     * @param obj1 base target
     * @param obj2 comparison target
     * @param exclude fields to exclude in the comparison
     */
    public objectDiff(obj1: Record<string, any>, obj2: Record<string, any>, exclude?: string[]) {
        let r = {};

        if (!exclude) {
            exclude = [];
        }

        for (let prop in obj1) {
            if (obj1.hasOwnProperty(prop) && prop !== '__proto__') {
                if (!exclude.includes(obj1[prop])) {

                    // check if obj2 has prop
                    if (!obj2.hasOwnProperty(prop)) {
                        r[prop] = obj1[prop];
                    } else if (obj1[prop] === Object(obj1[prop])) {
                        let difference = this.objectDiff(obj1[prop], obj2[prop]);
                        if (Object.keys(difference).length > 0) {
                            r[prop] = difference;
                        }
                    } else if (obj1[prop] !== obj2[prop]) {
                        if (obj1[prop] === undefined) {
                            r[prop] = 'undefined';
                        }

                        if (obj1[prop] === null) {
                            r[prop] = null;
                        } else if (typeof obj1[prop] === 'function') {
                            r[prop] = 'function';
                        } else if (typeof obj1[prop] === 'object') {
                            r[prop] = 'object';
                        } else {
                            r[prop] = obj1[prop];
                        }
                    }
                }
            }
        }
        return r;
    }

    /**
     * Tries to read a string from the buffer and will throw an error if there is no null terminator.
     * @param {SmartBuffer} bufferReader
     */
    public readStringNT(bufferReader: SmartBuffer): string {
        // Find next null character (if one is not found, throw)
        let buffer = bufferReader.toBuffer();
        let foundNullTerminator = false;
        for (let i = bufferReader.readOffset; i < buffer.length; i++) {
            if (buffer[i] === 0x00) {
                foundNullTerminator = true;
                break;
            }
        }

        if (!foundNullTerminator) {
            throw new Error('Could not read buffer string as there is no null terminator.');
        }
        return bufferReader.readStringNT();
    }

    /**
     * A reference to the current debug session. Used for logging, and set in the debug session constructor
     */
    public _debugSession: BrightScriptDebugSession;

    /**
     * Send debug server messages to the BrightScript Debug Log channel, as well as writing to console.debug
     */
    public logDebug(...args) {
        args = Array.isArray(args) ? args : [];
        let timestamp = dateFormat(new Date(), 'HH:mm:ss.l ');
        let messages = [];

        for (let arg of args) {
            if (arg instanceof Error) {
                messages.push(JSON.stringify({
                    message: arg.message,
                    name: arg.name,
                    stack: arg.stack.toString()
                }, null, 4));
            } else {
                messages.push(arg.toString());
            }
        }
        let text = messages.join(', ');
        if (this._debugSession) {
            this._debugSession.sendEvent(new DebugServerLogOutputEvent(`${timestamp}: ${text}`));
        }

        console.log(timestamp, ...args);
    }

    /**
     * Write to the standard brightscript output log so users can see it. (This also writes to the debug server output channel, and the console)
     * @param message
     */
    public log(message: string) {
        this.logDebug(message);
        if (this._debugSession) {
            this._debugSession.sendEvent(new LogOutputEvent(`DebugServer: ${message}`));
        }
    }

    /**
     * The vscode hover will occasionally forget to include the closing quotemark for quoted strings,
     * so this attempts to auto-insert a closing quotemark if an opening one was found but is missing the closing one
     * @param text
     */
    public ensureClosingQuote(text: string) {
        if (text.startsWith('"') && text.trim().endsWith('"') === false) {
            text = text.trim() + '"';
        }
        return text;
    }

    /**
     * Test if `position` is in `range`. If the position is at the edges, will return true.
     * Adapted from core vscode
     * @param range
     * @param position
     */
    public rangeContains(range: Range, position: Position) {
        if (position.line < range.start.line || position.line > range.end.line) {
            return false;
        }
        if (position.line === range.start.line && position.character < range.start.character) {
            return false;
        }
        if (position.line === range.end.line && position.character > range.end.character) {
            return false;
        }
        return true;
    }

    public filterGenericErrors(errors: BrightScriptDebugCompileError[]) {
        const specificErrors: Record<string, BrightScriptDebugCompileError> = {};

        //ignore generic errors when a specific error exists
        return errors.filter(e => {
            const path = e.path.toLowerCase();
            if (e.message === GENERAL_XML_ERROR) {
                if (specificErrors[path]) {
                    return false;
                }
            } else {
                specificErrors[path] = e;
            }
            return true;
        });
    }

    /**
     * Removes the trailing `Brightscript Debugger>` prompt if present. If not present, returns original value
     * @param value
     */
    public trimDebugPrompt(value: string) {
        const match = /(.*?)\r?\nBrightscript Debugger>\s*/is.exec(value);
        if (match) {
            return match[1];
        } else {
            return value;
        }
    }

    /**
     * Get the keys for a given variable expression, or undefined if the expression doesn't make sense.
     */
    public getVariablePathOld(expression: string): string[] {
        // Regex 101 link for match examples: https://regex101.com/r/KNKfHP/8
        let regexp = /(?:\[\"(.*?)\"\]|([a-z_][a-z0-9_\$%!#]*)|\[([0-9]*)\]|\.([0-9]+))/gi;
        let match: RegExpMatchArray;
        let variablePath = [];

        // eslint-disable-next-line no-cond-assign
        while (match = regexp.exec(expression)) {
            // match 1: strings between quotes - this["that"]
            // match 2: any valid brightscript viable format
            // match 3: array/list access via index - this[0]
            // match 3: array/list access via dot notation (not valid in code but returned as part of the VS Code flow) - this.0
            variablePath.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
        }
        return variablePath;
    }

    public getVariablePath(expression: string): string[] {
        //HACK: assign to a variable so it turns into a valid expression, then we'll look at the right-hand-side
        const parser = Parser.parse(`__rokuDebugVar = ${expression}`);
        if (
            //quit if there are parse errors
            parser.diagnostics.find(x => x.severity === DiagnosticSeverity.Error) ||
            //quit if there are zero statements or more than one statement
            parser.ast.statements.length !== 1
        ) {
            return undefined;
        }
        let value = (parser.ast.statements[0] as AssignmentStatement).value;

        const parts = [] as string[];
        while (value) {
            if (isVariableExpression(value)) {
                parts.unshift(value.name.text);
                return parts;
            } else if (isDottedGetExpression(value)) {
                parts.unshift(value.name.text);
                value = value.obj;
            } else if (isIndexedGetExpression(value)) {
                if (isLiteralExpression(value.index)) {
                    parts.unshift(
                        //remove leading and trailing quotes (won't hurt for numeric literals)
                        value.index.token.text?.replace(/^"/, '').replace(/"$/, '')
                    );
                } else {
                    //if we found a non-literal value, this entire variable path is NOT a true variable path
                    return;
                }
                value = value.obj;
            } else {
                //not valid
                return;
            }
        }
    }
}

const util = new Util();
export { util };
