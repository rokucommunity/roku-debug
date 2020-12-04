import * as eol from 'eol';
import { EventEmitter } from 'events';
import { util } from './util';

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

    public shutdown(): Promise<void> {
        //session is shuttind down, process logs immediately
        if (this.compileErrorTimer && this.status === CompileStatus.compileError) {
            //HACK: leave time for events and errors resolvers to run,
            //otherwise the staging folder will have been deleted
            return new Promise(resolve => {
                this.onCompileErrorTimer();
                setTimeout(() => resolve(), 100);
            });
        }
        return Promise.resolve();
    }

    private getErrors() {
        let syntaxErrors = this.getSyntaxErrors(this.compilingLines);
        let compileErrors = this.getCompileErrors(this.compilingLines);
        let xmlCompileErrors = this.getSingleFileXmlError(this.compilingLines);
        let xmlComponentErrors = this.getSingleFileXmlComponentError(this.compilingLines);
        let multipleXmlCompileErrors = this.getMultipleFileXmlError(this.compilingLines);
        let missingManifestError = this.getMissingManifestError(this.compilingLines);
        return [
            ...syntaxErrors,
            ...compileErrors,
            ...multipleXmlCompileErrors,
            ...xmlCompileErrors,
            ...xmlComponentErrors,
            ...missingManifestError
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
        lines.forEach((line) => {
            match = this.getSyntaxErrorDetails(line);
            if (match) {
                let path = this.sanitizeCompilePath(match[2]);
                let lineNumber = parseInt(match[3]); //1-based

                //FIXME
                //if this match is a livecompile error, throw out all prior errors because that means we are re-running
                if (path.toLowerCase().indexOf('$livecompile') === -1) {

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
        });
        return errors;
    }

    public getCompileErrors(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let responseText = lines.join('\n');
        const filesWithErrors = responseText.split('=================================================================');
        if (filesWithErrors.length < 2) {
            return [];
        }

        let getFileInfoRexEx = /Found(?:.*)file (.*)$/im;
        for (let index = 1; index < filesWithErrors.length - 1; index++) {
            const fileErrorText = filesWithErrors[index];
            //TODO - for now just a simple parse - later on someone can improve with proper line checks + all parse/compile types
            //don't have time to do this now; just doing what keeps me productive.
            let match = getFileInfoRexEx.exec(fileErrorText);
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
        let getFileInfoRexEx = /^--- Line (\d*): (.*)$/gim;
        let match: RegExpExecArray;
        while (match = getFileInfoRexEx.exec(fileErrorText)) {
            let lineNumber = parseInt(match[1]);
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
        let getFileInfoRexEx = /^-------> Error parsing XML component (.*).*$/i;
        lines.forEach((line) => {
            let match = getFileInfoRexEx.exec(line);
            if (match) {
                let errorText = 'ERR_COMPILE:';
                let path = this.sanitizeCompilePath(match[1]);

                errors.push({
                    path: path,
                    lineNumber: 1,
                    errorText: errorText,
                    message: 'general compile error in xml file',
                    charStart: 0,
                    charEnd: 999 //TODO
                });
            }
        });

        return errors;
    }

    public getSingleFileXmlComponentError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getFileInfoRexEx = /Error in XML component [a-z0-9_-]+ defined in file (.*)/i;
        lines.forEach((line, index) => {
            let match = getFileInfoRexEx.exec(line);
            if (match) {
                let errorText = 'ERR_COMPILE:';
                let path = match[1];
                errors.push({
                    path: path,
                    lineNumber: 1,
                    errorText: errorText,
                    message: `${line}\n${lines[index + 1] ?? ''}`,
                    charStart: 0,
                    charEnd: 999 //TODO
                });
            }
        });
        return errors;
    }

    public getMultipleFileXmlError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getFileInfoRexEx = /^-------> Error parsing multiple XML components \((.*)\)/i;
        lines.forEach((line) => {
            let match = getFileInfoRexEx.exec(line);
            if (match) {
                let errorText = 'ERR_COMPILE:';
                let files = match[1].split(',');
                files.forEach((file) => {
                    errors.push({
                        path: this.sanitizeCompilePath(file.trim()),
                        lineNumber: 1,
                        errorText: errorText,
                        message: 'general compile error in xml file',
                        charStart: 0,
                        charEnd: 999 //TODO
                    });
                });
            }
        });

        return errors;
    }

    public getMissingManifestError(lines: string[]): BrightScriptDebugCompileError[] {
        let errors: BrightScriptDebugCompileError[] = [];
        let getMissingManifestErrorRegEx = /^(?:-+)>(No manifest\. Invalid package\.)/i;
        lines.forEach((line) => {
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
        });

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
        util.log('## ROKU DEBUG resetTimer: ' + isRunning);

        if (this.compileErrorTimer) {
            clearInterval(this.compileErrorTimer);
            this.compileErrorTimer = undefined;
        }

        if (isRunning) {
            if (this.status === CompileStatus.compileError) {
                // console.debug('resetting resetCompileErrorTimer');
                this.compileErrorTimer = setTimeout(() => this.onCompileErrorTimer(), this.compileErrorTimeoutMs);
            }
        }
    }

    public onCompileErrorTimer() {
        util.log('## ROKU DEBUG onTimer');
        console.debug('onCompileErrorTimer: timer complete. should\'ve caught all errors ');

        this.status = CompileStatus.compileError;
        this.resetCompileErrorTimer(false);
        this.reportErrors();
    }

    private getStartingCompilingLine(lines: string[]): number {
        let lastIndex: number = -1;
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
        let lastIndex: number = -1;
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
        //throw out any lines before the last found compiling line

        let errors = this.getErrors();

        util.log('## ROKU DEBUG reportErrors: ' + errors.map(e => e.path).join(' '));

        errors = errors.filter((e) => {
            return e.path.toLowerCase().endsWith('.brs') || e.path.toLowerCase().endsWith('.xml') || e.path === 'manifest';
        });

        console.debug('errors.length ' + errors.length);
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
