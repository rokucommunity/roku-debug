import * as eol from 'eol';
import { EventEmitter } from 'events';

export const GENERAL_XML_ERROR = 'General XML compilation error';

export class CompileErrorProcessor {

    public status: CompileStatus = CompileStatus.none;
    public startCompilingLine = -1;
    public endCompilingLine = -1;
    public compilingLines = [];
    public compileErrorTimeoutMs = 1000;
    private emitter = new EventEmitter();
    public compileErrorTimer: NodeJS.Timeout;

    public on(eventName: 'compile-errors', handler: (params: BrightScriptDebugCompileError[]) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'compile-errors', data?) {
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

        let newLines = eol.split(responseText);
        // console.debug('processUnhandledLines: this.status ' + this.status);
        switch (this.status) {
            case CompileStatus.compiling:
            case CompileStatus.compileError:
                this.endCompilingLine = this.getEndCompilingLine(newLines);
                if (this.endCompilingLine !== -1) {
                    console.debug('processUnhandledLines: entering state CompileStatus.running');
                    this.status = CompileStatus.running;
                    this.resetCompileErrorTimer(false);
                } else {
                    this.compilingLines = this.compilingLines.concat(newLines);
                    if (this.status === CompileStatus.compiling) {
                        //check to see if we've entered an error scenario
                        let hasError = /\berror\b/gi.test(responseText);
                        if (hasError) {
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
                    console.debug('processUnhandledLines: entering state CompileStatus.compiling');
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

    private getErrors() {
        return [
            ...this.getSyntaxErrors(this.compilingLines),
            ...this.getCompileErrors(this.compilingLines),
            ...this.getMultipleFileXmlError(this.compilingLines),
            ...this.getSingleFileXmlError(this.compilingLines),
            ...this.getSingleFileXmlComponentError(this.compilingLines),
            ...this.getMissingManifestError(this.compilingLines)
        ];
    }

    /**
     * Runs a regex to get the content between telnet commands
     * @param value
     */
    private getSyntaxErrorDetails(value: string) {
        return /(syntax|compile) error.* in (.*)\((\d+)\)(.*)/gim.exec(value);
    }

    public getSyntaxErrors(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let match: RegExpExecArray;
        // let syntaxRegEx = /(syntax|compile) error.* in (.*)\((\d+)\)/gim;
        for (const line of lines) {
            match = this.getSyntaxErrorDetails(line);
            if (match) {
                let path = this.sanitizeCompilePath(match[2]);
                let lineNumber = parseInt(match[3]); //1-based

                //FIXME
                //if this match is a livecompile error, throw out all prior errors because that means we are re-running
                if (!path.toLowerCase().includes('$livecompile')) {

                    errors.push({
                        path: path,
                        lineNumber: lineNumber,
                        errorText: line,
                        message: match[0].trim(),
                        charStart: 0,
                        charEnd: 999 //TODO
                    });
                }
            }
        }
        return errors;
    }

    public getCompileErrors(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let responseText = lines.join('\n');
        const filesWithErrors = responseText.split('=================================================================');
        if (filesWithErrors.length < 2) {
            return [];
        }

        let getFileInfoRegEx = /Found(?:.*)file (.*)$/im;
        for (let index = 1; index < filesWithErrors.length - 1; index++) {
            const fileErrorText = filesWithErrors[index];
            //TODO - for now just a simple parse - later on someone can improve with proper line checks + all parse/compile types
            //don't have time to do this now; just doing what keeps me productive.
            let match = getFileInfoRegEx.exec(fileErrorText);
            if (!match) {
                continue;
            }

            let path = this.sanitizeCompilePath(match[1]);
            let lineNumber = 1; //TODO this should iterate over all line numbers found in a file
            let errorText = 'ERR_COMPILE:';
            let message = fileErrorText.trim();

            let error = {
                path: path,
                lineNumber: lineNumber,
                errorText: errorText,
                message: message,
                charStart: 0,
                charEnd: 999 //TODO
            };

            //now iterate over the lines, to see if there's any errors we can extract
            let lineErrors = this.getLineErrors(path, fileErrorText);
            if (lineErrors.length > 0) {
                errors.push(...lineErrors);
            } else {
                errors.push(error);
            }
        }
        return errors;
    }

    public getLineErrors(path: string, fileErrorText: string): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getFileInfoRegEx = /^--- Line (\d*): (.*)$/gim;
        let match: RegExpExecArray;
        // eslint-disable-next-line no-cond-assign
        while (match = getFileInfoRegEx.exec(fileErrorText)) {
            let lineNumber = parseInt(match[1]); // 1-based
            let errorText = 'ERR_COMPILE:';
            let message = this.sanitizeCompilePath(match[2]);

            errors.push({
                path: path,
                lineNumber: lineNumber,
                errorText: errorText,
                message: message,
                charStart: 0,
                charEnd: 999 //TODO
            });
        }

        return errors;
    }

    public getSingleFileXmlError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getFileInfoRegEx = /^-------> Error parsing XML component (.*).*$/i;
        for (let line of lines) {
            let match = getFileInfoRegEx.exec(line);
            if (match) {
                let errorText = 'ERR_COMPILE:';
                let path = this.sanitizeCompilePath(match[1]);

                errors.push({
                    path: path,
                    lineNumber: 1,
                    errorText: errorText,
                    message: GENERAL_XML_ERROR,
                    charStart: 0,
                    charEnd: 999 //TODO
                });
            }
        }

        return errors;
    }

    public getSingleFileXmlComponentError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getFileInfoRegEx = /Error in XML component [a-z0-9_-]+ defined in file (.*)/i;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match = getFileInfoRegEx.exec(line);
            if (match) {
                let errorText = 'ERR_COMPILE:';
                let path = match[1];
                errors.push({
                    path: path,
                    lineNumber: 1,
                    errorText: errorText,
                    message: `${line}\n${lines[i + 1] ?? ''}`,
                    charStart: 0,
                    charEnd: 999 //TODO
                });
            }
        }
        return errors;
    }

    public getMultipleFileXmlError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getFileInfoRegEx = /^-------> Error parsing multiple XML components \((.*)\)/i;
        for (const line of lines) {
            let match = getFileInfoRegEx.exec(line);
            if (match) {
                let errorText = 'ERR_COMPILE:';
                let filePaths = match[1].split(',');
                for (const path of filePaths) {
                    errors.push({
                        path: this.sanitizeCompilePath(path.trim()),
                        lineNumber: 1,
                        errorText: errorText,
                        message: GENERAL_XML_ERROR,
                        charStart: 0,
                        charEnd: 999 //TODO
                    });
                }
            }
        }

        return errors;
    }

    public getMissingManifestError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getMissingManifestErrorRegEx = /^(?:-+)>(No manifest\. Invalid package\.)/i;
        for (const line of lines) {
            let match = getMissingManifestErrorRegEx.exec(line);
            if (match) {
                errors.push({
                    path: 'manifest',
                    lineNumber: 1,
                    errorText: 'ERR_COMPILE:',
                    message: match[1],
                    charStart: 0,
                    charEnd: 999 //TODO
                });
            }
        }

        return errors;
    }

    public sanitizeCompilePath(debuggerPath: string): string {
        let protocolIndex = debuggerPath.indexOf('pkg:/');

        if (protocolIndex > 0) {
            return debuggerPath.slice(protocolIndex);
        }

        return debuggerPath;
    }

    public resetCompileErrorTimer(isRunning): any {
        // console.debug('resetCompileErrorTimer isRunning' + isRunning);

        if (this.compileErrorTimer) {
            clearInterval(this.compileErrorTimer);
            this.compileErrorTimer = undefined;
        }

        if (isRunning) {
            if (this.status === CompileStatus.compileError) {
                // console.debug('resetting resetCompileErrorTimer');
                this.compileErrorTimer = setTimeout(() => {
                    this.onCompileErrorTimer();
                }, this.compileErrorTimeoutMs);
            }
        }
    }

    public onCompileErrorTimer() {
        console.debug('onCompileErrorTimer: timer complete. should\'ve caught all errors ');

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
        console.debug('reportErrors');

        const errors = this.getErrors().filter((e) => {
            const path = e.path.toLowerCase();
            return path.endsWith('.brs') || path.endsWith('.xml') || path === 'manifest';
        });

        if (errors.length > 0) {
            this.emit('compile-errors', errors);
        }
    }
}

export interface BrightScriptDebugCompileError {
    path: string;
    lineNumber: number;
    message: string;
    errorText: string;
    charStart: number;
    charEnd: number;
}

export enum CompileStatus {
    none = 'none',
    compiling = 'compiling',
    compileError = 'compileError',
    running = 'running'
}
