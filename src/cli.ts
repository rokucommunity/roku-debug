#!/usr/bin/env node
import * as yargs from 'yargs';
import { BrightScriptDebugSession } from './debugSession/BrightScriptDebugSession';

let options = yargs
    .usage('$0', 'roku-debug, support for debugging Roku devices via telnet or debug protocol')
    .help('help', 'View help information about this tool.')
    .option('dap', { type: 'boolean', defaultDescription: 'false', description: 'Run roku-debug as a standalone debug-adapter-protocol process, communicating over STDIO' })
    .parse();

(function main() {
    if (options.dap) {
        BrightScriptDebugSession.run(BrightScriptDebugSession);
    } else {
        throw new Error('Not supported');
    }
}());
