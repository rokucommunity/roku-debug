import { EventEmitter } from 'events';
import type { Diagnostic } from 'vscode-languageserver-protocol/node';
import { logger } from './logging';
import { util as bscUtil } from 'brighterscript';

export const GENERAL_XML_ERROR = 'General XML compilation error';

export class CompileErrorProcessor {

    private logger = logger.createLogger(`[${CompileErrorProcessor.name}]`);
    public status: CompileStatus = CompileStatus.none;
    public startCompilingLine = -1;
    public endCompilingLine = -1;
    public compilingLines = [] as string[];
    public compileErrorTimeoutMs = 1000;
    private emitter = new EventEmitter();
    public compileErrorTimer: NodeJS.Timeout;

    public on(eventName: 'diagnostics', handler: (params: BSDebugDiagnostic[]) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'diagnostics', data?) {
        //emit these events on next tick, otherwise they will be processed immediately which could cause issues
        setTimeout(() => {
            //in rare cases, this event is fired after the debugger has closed, so make sure the event emitter still exists
            if (this.emitter) {
                this.emitter.emit(eventName, data);
            }
        }, 0);
    }

    public processUnhandledLines(responseText: string) {
        if (this.status === CompileStatus.running) {
            return;
        }

        let newLines = responseText.split(/\r?\n/g);
        switch (this.status) {
            case CompileStatus.compiling:
            case CompileStatus.compileError:
                this.endCompilingLine = this.getEndCompilingLine(newLines);
                if (this.endCompilingLine !== -1) {
                    this.logger.debug('[processUnhandledLines] entering state CompileStatus.running');
                    this.status = CompileStatus.running;
                    this.resetCompileErrorTimer(false);
                } else {
                    this.compilingLines = this.compilingLines.concat(newLines);
                    if (this.status === CompileStatus.compiling) {
                        //check to see if we've entered an error scenario
                        let hasError = /\berror\b/gi.test(responseText);
                        if (hasError) {
                            this.logger.debug('[processUnhandledLines] entering state CompileStatus.compileError');
                            this.status = CompileStatus.compileError;
                        }
                    }
                    if (this.status === CompileStatus.compileError) {
                        //every input line while in error status will reset the stale timer, so we can wait for more errors to roll in.
                        this.resetCompileErrorTimer(true);
                    }
                }
                break;
            case CompileStatus.none:
                this.startCompilingLine = this.getStartingCompilingLine(newLines);
                this.compilingLines = this.compilingLines.concat(newLines);
                if (this.startCompilingLine !== -1) {
                    this.logger.debug('[processUnhandledLines] entering state CompileStatus.compiling');
                    newLines.splice(0, this.startCompilingLine);
                    this.status = CompileStatus.compiling;
                    this.resetCompileErrorTimer(true);
                }
                break;
        }
    }

    public sendErrors(): Promise<void> {
        //session is shutting down, process logs immediately
        //HACK: leave time for events and errors resolvers to run,
        //otherwise the staging folder will have been deleted
        return new Promise<void>(resolve => {
            this.onCompileErrorTimer();
            setTimeout(resolve, 500);
        });
    }

    public getErrors(lines: string[]) {
        const result: BSDebugDiagnostic[] = [];
        //clone the lines so the parsers can manipulate them
        lines = [...lines];
        while (lines.length > 0) {
            const startLength = lines.length;
            const line = lines[0];

            if (line) {
                result.push(
                    ...[
                        this.processMultiLineErrors(lines),
                        this.parseComponentDefinedInFileError(lines),
                        this.parseGenericXmlError(line),
                        this.parseSyntaxAndCompileErrors(line),
                        this.parseMissingManifestError(line)
                    ].flat().filter(x => !!x)
                );
            }
            //if none of the parsers consumed a line, remove the first line
            if (lines.length === startLength) {
                lines.shift();
            }
        }
        return result.filter(x => {
            //throw out $livecompile errors (those are generated by REPL/eval code)
            return x.path && !x.path.toLowerCase().includes('$livecompile');
        });
    }

    /**
     * Parse generic xml errors with no further context below
     */
    public parseGenericXmlError(line: string): BSDebugDiagnostic[] {
        let [, message, files] = this.execAndTrim(
            // https://regex101.com/r/LDUyww/3
            /^(?:-+\>)?\s*(Error parsing (?:multiple )?XML component[s]?)\s+\(?(.+\.xml)\)?.*$/igm,
            line
        ) ?? [];
        if (message && typeof files === 'string') {
            //use the singular xml parse message since the plural doesn't make much sense when attached to a single file
            if (message.toLowerCase() === 'error parsing multiple xml components') {
                message = 'Error parsing XML component';
            }
            //there can be 1 or more file paths, so add a distinct error for each one
            return files.split(',')
                .map(filePath => ({
                    path: this.sanitizeCompilePath(filePath),
                    range: bscUtil.createRange(0, 0, 0, 999),
                    message: this.buildMessage(message),
                    code: undefined
                }))
                .filter(x => !!x);
        }
    }

    /**
     * Parse the standard syntax and compile error format
     */
    private parseSyntaxAndCompileErrors(line: string): BSDebugDiagnostic[] {
        let [, message, errorType, code, trailingInfo] = this.execAndTrim(
            // https://regex101.com/r/HHZ6dE/3
            /(.*?)(?:\(((?:syntax|compile)\s+error)\s+(&h[\w\d]+)?\s*\))\s*in\b\s+(.+)/ig,
            line
        ) ?? [];

        if (message) {
            //split the file path, line number, and trailing context if available.
            let [, filePath, lineNumber, context] = this.execAndTrim(
                /(.+)\((\d+)?\)(.*)/ig,
                trailingInfo
                //default the `filePath` var to the whole `trailingInfo` string
            ) ?? [null, trailingInfo, null, null];

            return [{
                path: this.sanitizeCompilePath(filePath),
                message: this.buildMessage(message, context),
                range: this.getRange(lineNumber), //lineNumber is 1-based
                code: code
            }];
        }
    }

    /**
     * Handles when an error lists the filename on the first line, then subsequent lines each have 1 error.
     * Stops on the first line that doesn't have an error line. Like this:
     * ```
     *  Found 3 parse errors in XML file Foo.xml
     *  --- Line 2: Unexpected data found inside a <component> element (first 10 characters are "aaa")
     *  --- Line 3: Some unique error message
     *  --- Line 5: message with Line 4 inside it
     */
    private processMultiLineErrors(lines: string[]): BSDebugDiagnostic[] {
        const errors = [];
        let [, count, filePath] = this.execAndTrim(
            // https://regex101.com/r/wBMp8B/1
            /found (\d+).*error[s]? in.*?file(.*)/gmi,
            lines[0]
        ) ?? [];
        filePath = this.sanitizeCompilePath(filePath);
        if (filePath) {
            let i = 0;
            //parse each line that looks like it's an error.
            for (i = 1; i < lines.length; i++) {
                //example: `Line 1: Unexpected data found inside a <component> element (first 10 characters are "aaa")`)
                const [, lineNumber, message] = this.execAndTrim(
                    /^[\-\s]*line (\d*):(.*)$/gim,
                    lines[i]
                ) ?? [];
                if (lineNumber && message) {
                    errors.push({
                        path: filePath,
                        range: this.getRange(lineNumber), //lineNumber is 1-based
                        message: this.buildMessage(message),
                        code: undefined
                    });
                } else {
                    //assume there are no more errors for this file
                    break;
                }
            }
            //remove the lines we consumed
            lines.splice(0, i);
        }
        return errors;
    }

    /**
     * Parse errors that look like this:
     * ```
     * Error in XML component RedButton defined in file pkg:/components/RedButton.xml
     * -- Extends type does not exist: "ColoredButton"
     */
    private parseComponentDefinedInFileError(lines: string[]): BSDebugDiagnostic[] {
        let [, message, filePath] = this.execAndTrim(
            /(Error in XML component [a-z0-9_-]+) defined in file (.*)/i,
            lines[0]
        ) ?? [];
        if (filePath) {
            lines.shift();
            //assume the next line includes the actual error message
            if (lines[0]) {
                message = lines.shift();
            }
            return [{
                message: this.buildMessage(message),
                path: this.sanitizeCompilePath(filePath),
                range: this.getRange(),
                code: undefined
            }];
        }
    }

    /**
     * Parse error messages that look like this:
     * ```
     * ------->No manifest. Invalid package.
     * ```
     */
    private parseMissingManifestError(line: string): BSDebugDiagnostic[] {
        let [, message] = this.execAndTrim(
            // https://regex101.com/r/ANr5xd/1
            /^(?:-+)>(No manifest\. Invalid package\.)/i
            ,
            line
        ) ?? [];
        if (message) {
            return [{
                path: 'pkg:/manifest',
                range: bscUtil.createRange(0, 0, 0, 999),
                message: this.buildMessage(message)
            }];
        }
    }

    /**
     * Exec the regexp, and if there's a match, trim every group
     */
    private execAndTrim(pattern: RegExp, text: string) {
        return pattern.exec(text)?.map(x => x?.trim());
    }

    private buildMessage(message: string, context?: string) {
        //remove any leading dashes or whitespace
        message = message.replace(/^[ \t\-]+/g, '');

        //append context to end of message (if available)
        if (context?.length > 0) {
            message += ' ' + context;
        }
        //remove trailing period from message
        message = message.replace(/[\s.]+$/, '');

        return message;
    }

    /**
     * Given a text-based line number, convert it to a number and return a range.
     * Defaults to line number 1 (1-based) if unable to parse.
     * @returns a zero-based vscode `Range` object
     */
    private getRange(lineNumberText?: string) {
        //convert the line number to an integer (if applicable)
        let lineNumber = parseInt(lineNumberText); //1-based
        lineNumber = isNaN(lineNumber) ? 1 : lineNumber;
        return bscUtil.createRange(lineNumber - 1, 0, lineNumber - 1, 999);
    }

    /**
     * Trim all leading junk up to the `pkg:/` in this string
     */
    public sanitizeCompilePath(debuggerPath: string): string {
        return debuggerPath?.replace(/.*?(?=pkg:\/)/, '')?.trim();
    }

    public resetCompileErrorTimer(isRunning): any {
        if (this.compileErrorTimer) {
            clearInterval(this.compileErrorTimer);
            this.compileErrorTimer = undefined;
        }

        if (isRunning) {
            if (this.status === CompileStatus.compileError) {
                this.compileErrorTimer = setTimeout(() => {
                    this.onCompileErrorTimer();
                }, this.compileErrorTimeoutMs);
            }
        }
    }

    public onCompileErrorTimer() {
        this.status = CompileStatus.compileError;
        this.resetCompileErrorTimer(false);
        this.reportErrors();
    }

    private getStartingCompilingLine(lines: string[]): number {
        let lastIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            //if this line looks like the compiling line
            if (/------\s+compiling.*------/i.exec(line)) {
                lastIndex = i;
            }
        }
        return lastIndex;
    }

    private getEndCompilingLine(lines: string[]): number {
        let lastIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            // if this line looks like the compiling line
            if (/------\s+Running.*------/i.exec(line)) {
                lastIndex = i;
            }
        }
        return lastIndex;

    }

    /**
     * Look through the given responseText for a compiler error
     * @param responseText
     */
    private reportErrors() {
        const errors = this.getErrors(this.compilingLines);
        if (errors.length > 0) {
            this.emit('diagnostics', errors);
        }
    }

    public destroy() {
        if (this.emitter) {
            this.emitter.removeAllListeners();
        }
    }
}

export interface BSDebugDiagnostic extends Diagnostic {
    /**
     * Path to the file in question. When emitted from a Roku device, this will be a full pkgPath (i.e. `pkg:/source/main.brs`).
     * As it flows through the program, this may be modified to represent a source location (i.e. `C:/projects/app/source/main.brs`)
     */
    path: string;
    /**
     * The name of the component library this diagnostic was emitted from. Should be undefined if diagnostic originated from the
     * main app.
     */
    componentLibraryName?: string;
}

export enum CompileStatus {
    none = 'none',
    compiling = 'compiling',
    compileError = 'compileError',
    running = 'running'
}
