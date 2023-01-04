import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as net from 'net';
import * as url from 'url';
import type { SmartBuffer } from 'smart-buffer';
import type { BrightScriptDebugSession } from './debugSession/BrightScriptDebugSession';
import { LogOutputEvent } from './debugSession/Events';
import type { AssignmentStatement, Position, Range } from 'brighterscript';
import { Expression, DiagnosticSeverity, isDottedGetExpression, isIndexedGetExpression, isLiteralExpression, isVariableExpression, Parser } from 'brighterscript';
import { serializeError } from 'serialize-error';
import * as dns from 'dns';
import type { AdapterOptions } from './interfaces';

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
                    //add match in all lower case too (for consistency)
                    manifestValues[match[1]?.toLowerCase()] = match[2];
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
     * Write to the standard brightscript output log so users can see it. (This also writes to the debug server output channel, and the console)
     * @param message
     */
    public log(message: string) {
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

    /**
     * Ensures that all roku-emitted beacons are entirely on their own lines
     */
    public ensureDebugPromptOnOwnLine(text: string) {
        const regexp = /^((.*?)Brightscript\s+Debugger>\s*)(.*?)$/gm;
        let match: RegExpExecArray;
        const splitIndexes = [] as number[];
        while ((match = regexp.exec(text))) {
            const leadingAndBeaconText = match[1];
            const leadingText = match[2];
            const trailingText = match[3];
            //if there is text before the beacon, split the line
            if (leadingText.length > 0) {
                splitIndexes.push(match.index + leadingText.length);
            }
            //if there is text after the beacon, split the line
            if (trailingText.length > 0) {
                splitIndexes.push(match.index + leadingAndBeaconText.length);
            }
        }

        let result = text;
        //inject newlines between each split index
        for (let i = splitIndexes.length - 1; i >= 0; i--) {
            const index = splitIndexes[i];
            result = result.substring(0, index) + '\n' + result.substring(index);
        }
        return result;
    }

    /**
     * Does the string end with the "Brightscript Debugger>" prompt?
     * @param responseText
     */
    public endsWithDebuggerPrompt(text: string) {
        let match = /Brightscript\s+Debugger>\s*$/im.exec(text.trim());
        return !!match;
    }

    /**
     * Does the string end with the "thread attached......" text, ignoring trailing whitespace.
     * explanation: https://regex101.com/r/pN6grB/1
     */
    public endsWithThreadAttachedText(text: string) {
        if (/thread\s+attached\s*:.*?\(\d*\).*?[\r\n\s]*$/i.exec(text)) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Remove those pesky "Thread attached" messages and the debugger prompt following them.
     * explanation: https://regex101.com/r/OwAWdw/4
     */
    public removeThreadAttachedText(text: string) {
        const match = /^([\r\n\s]*thread\s+attached\s*:.*?\(\d*\).*?[\r\n\s]*brightscript\s*debugger>\s*)+/i.exec(text);
        if (match) {
            return text.substring(match[0].length);
        } else {
            return text;
        }
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
     * Check if the parameter is an expression
     * The HACK protion is copied from the getVariablePath function
     * @param expression
     */
    public isAssignableExpression(expression: string): boolean {
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
        return value instanceof Expression;
    }
    /**
     * Get the keys for a given variable expression, or undefined if the expression doesn't make sense.
     */
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
                        value.index.token.text
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

    /**
     * Given a full URL, convert any dns name into its IP address and then return the full URL with the name replaced
     */
    public async resolveUrl(url: string, skipCache = false) {
        //https://regex101.com/r/cSkoTx/1
        const [, protocol, host] = /^((?:http[s]?|ftp):\/\/)?([^:\/\s]+)(:\d+)?([^?#]+)?(\?[^#]+)?(#.*)?$/.exec(url) ?? [];
        if (host) {
            const ipAddress = await this.dnsLookup(host);
            url = protocol + ipAddress + url.substring(protocol.length + host.length);
        }
        return url;
    }

    /*
     * Look up the ip address for a hostname. This is cached for the lifetime of the app, or bypassed with the `skipCache` parameter
     * @param host
     * @param skipCache
     * @returns
     */
    public async dnsLookup(host: string, skipCache = false) {
        if (!this.dnsCache.has(host) || skipCache) {
            const result = await dns.promises.lookup(host);
            this.dnsCache.set(host, result.address ?? host);
        }
        return this.dnsCache.get(host);
    }

    private dnsCache = new Map<string, string>();

    /**
     * Is this expression the `print` keyword followed by a variable expression (like `a.b` or `a['b'].c`)
     * @param expression
     */
    public isPrintVarExpression(expression: string) {
        expression = expression.trim().toLowerCase();
        if (expression.startsWith('print') || expression.startsWith('?')) {
            const parts = this.getVariablePath(expression.replace(/^(print|\?)/, ''));
            if (parts?.length > 0) {
                return true;
            }
        }
        return false;
    }

    /*
     * Sleep for the given number of milliseconds
     * @param milliseconds
     * @returns
     */
    public sleep(milliseconds: number) {
        return new Promise(resolve => {
            setTimeout(resolve, milliseconds);
        });
    }

    public fence(data: string) {
        const fence = '--------------------';
        return `\n${fence}\n${data}\n${fence}\n`;
    }

    public formatTime(ms: number) {
        const allocate = msUnit => {
            const units = Math.trunc(ms / msUnit);
            ms -= units * msUnit;
            return units;
        };
        const hours = allocate(3600000);
        const minutes = allocate(60000);
        const seconds = allocate(1000);
        return `${hours > 0 ? hours + 'h' : ''}${minutes > 0 ? minutes + 'm' : ''}${seconds > 0 ? seconds + 's' : ''}${ms > 0 ? ms + 'ms' : ''}`;
    }

    public normalizeAdapterOptions(options: AdapterOptions) {
        options.brightScriptConsolePort ??= 8085;
        options.remotePort ??= 8060;
    }

    /**
     * Set an interval that can be cleared by calling the callback
     * @param intervalMs the number of milliseconds to wait for the next interval
     */
    public setInterval(callback: (cancel: () => void) => any, intervalMs: number) {
        const cancel = () => {
            clearInterval(handle);
        };
        const handle = setInterval(() => {
            callback(cancel);
        }, intervalMs);

        //call immediately
        callback(cancel);

        return cancel;
    }
}

export function defer<T>() {
    let _resolve: (value?: PromiseLike<T> | T) => void;
    let _reject: (reason?: any) => void;
    let promise = new Promise<T>((resolveValue, rejectValue) => {
        _resolve = resolveValue;
        _reject = rejectValue;
    });
    return {
        promise: promise,
        resolve: function resolve(value?: PromiseLike<T> | T) {
            if (!this.isResolved) {
                this.isResolved = true;
                _resolve(value);
                _resolve = undefined;
            } else {
                throw new Error(
                    `Attempted to resolve a promise that was already ${this.isResolved ? 'resolved' : 'rejected'}.` +
                    `New value: ${JSON.stringify(value)}`
                );
            }
        },
        reject: function reject(reason?: any) {
            if (!this.isCompleted) {
                this.isRejected = true;
                _reject(reason);
                _reject = undefined;
            } else {
                throw new Error(
                    `Attempted to reject a promise that was already ${this.isResolved ? 'resolved' : 'rejected'}.` +
                    `New error message: ${JSON.stringify(serializeError(reason))}`
                );
            }
        },
        isResolved: false,
        isRejected: false,
        get isCompleted() {
            return this.isResolved || this.isRejected;
        }
    };
}

export const util = new Util();
export interface Deferred<T> {
    promise: Promise<T>;
    resolve(value?: T);
    reject(error?: any);
}
