#!/usr/bin/env node
import * as yargs from 'yargs';
import { BrightScriptDebugSession } from './debugSession/BrightScriptDebugSession';
import { CliDebugger } from './CliDebugger';

const cli = yargs
    .usage('$0 [options]', 'roku-debug, support for debugging Roku devices via telnet or debug protocol')
    .help('help', 'View help information about this tool.')
    .option('dap', {
        type: 'boolean',
        default: false,
        description: 'Run roku-debug as a standalone debug-adapter-protocol process, communicating over STDIO'
    })
    // Connection options
    .option('host', {
        type: 'string',
        description: 'The host or IP address of the target Roku device'
    })
    .option('password', {
        type: 'string',
        description: 'The password for the developer page on the target Roku device'
    })
    .option('username', {
        type: 'string',
        default: 'rokudev',
        description: 'The username for the developer page on the target Roku device'
    })
    // Project options
    .option('root-dir', {
        type: 'string',
        description: 'The root directory that contains your Roku project (the folder containing your manifest file). Defaults to the current working directory'
    })
    .option('out-dir', {
        type: 'string',
        description: 'The folder where output files are placed during the packaging process'
    })
    .option('staging-dir', {
        type: 'string',
        description: 'Path used for the staging folder where files are written right before being packaged'
    })
    // Debugging options
    .option('enable-debug-protocol', {
        type: 'boolean',
        default: false,
        description: 'Use the BrightScript debug protocol instead of the telnet debugger'
    })
    .option('stop-on-entry', {
        type: 'boolean',
        default: false,
        description: 'Stop at the first executable line of the program'
    })
    .option('deep-link-url', {
        type: 'string',
        description: 'Launch the Roku app using the provided deep link URL'
    })
    // Port options
    .option('package-port', {
        type: 'number',
        default: 80,
        description: 'The port used when installing the package onto the Roku device'
    })
    .option('remote-port', {
        type: 'number',
        default: 8060,
        description: 'The port used to send remote control commands to the Roku device'
    })
    .option('control-port', {
        type: 'number',
        default: 8081,
        description: 'The port used to connect to and control a debug protocol session'
    })
    .option('bright-script-console-port', {
        type: 'number',
        default: 8085,
        description: 'The BrightScript console port used for telnet or compile-error detection'
    })
    .option('scene-graph-debug-commands-port', {
        type: 'number',
        default: 8080,
        description: 'The port used to send SceneGraph debug commands'
    })
    // Logging options
    .option('log-level', {
        type: 'string',
        choices: ['error', 'warn', 'log', 'info', 'debug', 'trace', 'off'] as const,
        default: 'log',
        description: 'The log level for the debug session'
    })
    .example('$0 --host 192.168.1.100 --password 1234 --root-dir ./dist', 'Debug a Roku app at the given host')
    .example('$0 --dap', 'Run as a DAP adapter communicating over STDIO (used by IDE integrations)');

(function main() {
    const options = cli.argv as ReturnType<typeof cli.parseSync>;

    if (options.dap) {
        BrightScriptDebugSession.run(BrightScriptDebugSession);
    } else if (options.host) {
        const cliDebugger = new CliDebugger({
            host: options.host as string,
            password: options.password as string,
            username: options.username as string,
            rootDir: (options['root-dir'] as string) ?? process.cwd(),
            cwd: process.cwd(),
            outDir: options['out-dir'] as string | undefined,
            stagingDir: options['staging-dir'] as string | undefined,
            enableDebugProtocol: options['enable-debug-protocol'] as boolean,
            stopOnEntry: options['stop-on-entry'] as boolean,
            deepLinkUrl: options['deep-link-url'] as string | undefined,
            packagePort: options['package-port'] as number,
            remotePort: options['remote-port'] as number,
            controlPort: options['control-port'] as number,
            brightScriptConsolePort: options['bright-script-console-port'] as number,
            sceneGraphDebugCommandsPort: options['scene-graph-debug-commands-port'] as number,
            logLevel: options['log-level'] as any
        });
        cliDebugger.start().catch((err) => {
            console.error('[roku-debug] Fatal error:', err.message ?? err);
            process.exit(1);
        });
    } else {
        cli.showHelp();
    }
}());
