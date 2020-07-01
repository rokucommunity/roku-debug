import * as dateFormat from 'dateformat';
import * as fs from 'fs';
import * as fsExtra from 'fs-extra';
import * as net from 'net';
import * as url from 'url';
import { SmartBuffer } from 'smart-buffer';
import { BrightScriptDebugSession } from './debugSession/BrightScriptDebugSession';
import { DebugServerLogOutputEvent, LogOutputEvent } from './debugSession/Events';

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
    public async convertManifestToObject(path: string): Promise<{ [key: string]: string } | undefined> {
        if (await this.fileExists(path) === false) {
            return undefined;
        } else {
            let fileContents = (await fsExtra.readFile(path)).toString();
            let manifestLines = fileContents.split('\n');

            let manifestValues = {};
            manifestLines.map((line) => {
                let match;
                if (match = /(\w+)=(.+)/.exec(line)) {
                    manifestValues[match[1]] = match[2];
                }
            });

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
                .once('error', (err: any) => (err.code === 'EADDRINUSE' ? resolve(true) : reject(err)))
                .once('listening', () => tester.once('close', () => resolve(false)).close())
                .listen(port);
        });
    }

    /**
     * With return the differences in two objects
     * @param obj1 base target
     * @param obj2 comparison target
     * @param exclude fields to exclude in the comparison
     */
    public objectDiff(obj1: object, obj2: object, exclude?: string[]) {
        let r = {};

        if (!exclude) { exclude = []; }

        for (let prop in obj1) {
            if (obj1.hasOwnProperty(prop) && prop !== '__proto__') {
                if (exclude.indexOf(obj1[prop]) === -1) {

                    // check if obj2 has prop
                    if (!obj2.hasOwnProperty(prop)) { r[prop] = obj1[prop]; } else if (obj1[prop] === Object(obj1[prop])) {
                        let difference = this.objectDiff(obj1[prop], obj2[prop]);
                        if (Object.keys(difference).length > 0) { r[prop] = difference; }
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
        this._debugSession?.sendEvent(new DebugServerLogOutputEvent(`${timestamp}: ${text}`));

        console.log.apply(console, [timestamp, ...args]);
    }

    /**
     * Write to the standard brightscript output log so users can see it. (This also writes to the debug server output channel, and the console)
     * @param message
     */
    public log(message: string) {
        this.logDebug(message);
        this._debugSession?.sendEvent(new LogOutputEvent(`DebugServer: ${message}`));
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

}

const util = new Util();
export { util };
