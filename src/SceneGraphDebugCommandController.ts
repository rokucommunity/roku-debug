import { logger } from './logging';

// eslint-disable-next-line
const Telnet = require('telnet-client');

export class SceneGraphDebugCommandController {
    constructor(public host: string, port?: number) {
        this.port = port ?? 8080; 
    }

    private connection: typeof Telnet;

    private shellPrompt = /^>$/img;
    private echoLines = 0;
    public timeout = 5000;
    public execTimeout = 2000;
    private port;
    private maxBufferLength = 5242880;

    private logger = logger.createLogger(`[${SceneGraphDebugCommandController.name}]`);

    public async connect(options: { execTimeout?: number; timeout?: number } = {}) {
        this.removeConnection();

        try {
            // Make a new telnet connections object
            let connection = new Telnet();

            connection.on('close', () => {
                this.removeConnection();
            });
            const config = {
                host: this.host,
                port: this.port,
                shellPrompt: this.shellPrompt,
                echoLines: this.echoLines,
                timeout: this.timeout,
                execTimeout: this.execTimeout,
                maxBufferLength: this.maxBufferLength,
                ...options
            };
            this.logger.debug('Establishing telnet connection', config);
            await connection.connect(config);
            this.connection = connection;
        } catch (e) {
            throw new Error((e as Error).message);
        }
    }

    private removeConnection() {
        this.connection = null;
    }

    /**
     * executes the different bsprof commands used for brightscript profiling.
     * @param {('pause'|'resume'|'status')} option Pause, resume, or get BS profiling status.
     */
    public async bsprof(option: 'pause' | 'resume' | 'status'): Promise<SceneGraphCommandResponse> {
        return this.exec(`bsprof-${option}`);
    }

    /**
     * Prints the current memory and CPU utilization of a channel (RAM usage is reported in KibiBytes [KiB]). The channel manifest must include the run_as_process=1 attribute to use this command.
     *
     * If an interval is provided the device repeats the command the specified number of seconds and outputs the results to port 8085.
     * (Available since Roku OS 10.0)
     * @param {{ interval: number }} [options] logging interval in seconds. 0 will stop interval logging.
     */
    public async chanperf(options?: { interval: number }): Promise<SceneGraphCommandResponse> {
        let command = 'chanperf';

        if (options) {
            // TODO: revisit this as channelId support is documented but the command does not seem to work. Device returns 'ERR: unknown arg: <channelId>'
            // command = options?.channelId ? `${command} ${options.channelId}` : command;
            command = options?.interval > -1 ? `${command} -r ${options.interval}` : command;
        }

        return this.exec(command);
    }

    /**
     * Clear all caches that can affect channel launch time.
     */
    public async clearLaunchCaches(): Promise<SceneGraphCommandResponse> {
        return this.exec('clear_launch_caches');
    }

    /**
     * Displays frames-per-second and free memory on-screen. Leverage this tool to optimize your channel UI. It presents a 1-second moving average of the current frame rate.
     * @param {('off'|'on'|'toggle')} option
     */
    public async fpsDisplay(option: 'off' | 'on' | 'toggle'): Promise<SceneGraphCommandResponse> {
        let command = 'fps_display';

        if (option !== 'toggle') {
            command = `${command} ${option === 'on' ? 1 : 0}`;
        }

        let response = await this.exec(command);
        if (!response.error) {
            response.result.data = `FPS Display: ${option}`;
        }
        return response;
    }

    /**
     * Provides a snapshot of the amount of in-use and free memory on the device.
     */
    public async free(): Promise<SceneGraphCommandResponse> {
        return this.exec('free');
    }

    /**
     * Generate a new developer key.
     */
    public async genkey(): Promise<SceneGraphCommandResponse> {
        return this.exec('genkey');
    }


    /**
     * Displays the current set of images loaded into texture memory.
     */
    public async loadedTextures(): Promise<SceneGraphCommandResponse> {
        return this.exec('loaded_textures');
    }

    /**
     * Enable, disable, or checks the status of console logging of thread rendezvous.
     * @param {('status'|'off'|'on')} option
     */
    public async logrendezvous(option: 'status' | 'off' | 'on'): Promise<SceneGraphCommandResponse> {
        let command = 'logrendezvous';

        if (option !== 'status') {
            command = `${command} ${option}`;
        }

        return this.exec(command);
    }

    /**
     * Show list of all installed plugins.
     */
    public async plugins(): Promise<SceneGraphCommandResponse> {
        return this.exec('plugins');
    }

    /**
     * Simulate a keypress.
     * @param {string[]} keys A list of keys to press in sequence
     */
    public async press(keys: string[]): Promise<SceneGraphCommandResponse> {
        // Add 1 second per character to the max execution timeout because roku is really slow......
        return this.exec(`press ${keys.join(', ')}`, { execTimeout: this.execTimeout + (keys.length * 1000) });
    }


    /**
     * Prints a list of assets loaded into texture memory and the amount of free, used, and maximum available memory on your device, respectively.
     * Starting with Roku OS 9.3, the name of each bitmap is included.
     */
    public async r2d2Bitmaps(): Promise<SceneGraphCommandResponse> {
        return this.exec('r2d2_bitmaps');
    }


    /**
     * Removes the indicated channel from the local device, as well as from all devices linked to the same Roku account. For example, if a channel has a channel id of "987654_cf9a", then the following command would remove it: remove_plugin 987654_cf9a
     *
     * The list of available channel ids can be seen with the 'plugins' command. The local device must be linked to a Roku account.
     *
     * To use this command, the local device must be linked to a Roku account. Channels are not removed on another device until it synchronizes with the Roku Channel Store (for example, via an automatic check for updates).
     * (Available since Roku OS 10.0)
     *
     * @param {string} channelId
     */
    public async removePlugin(channelId: string): Promise<SceneGraphCommandResponse> {
        return this.exec(`remove_plugin ${channelId}`);
    }


    /**
     * Prints every existing node created by the currently running channel.
     * As of Roku OS 10.0, this prints the number of 'osref' references to the node (held in the Roku platform) and 'bscref' references (held in the channel application).
     * The 'bcsref' count includes references from "m." variable and local variables. Child references and field references do not increase 'bscref' counts.
     *
     * The 'osref' count also includes child references and references from Roku SceneGraph interface fields. For example, for any node with a parent, the parent will count as one 'osref' on the child.
     * Additionally, any field of type 'node', 'nodearray', or 'assocarray' will add one 'osref' to each node referenced from within that field.
     * These could be in variables local to a function, arrays, or associative arrays, including a component global m or an associative array field of a node.
     *
     * The reported 'osref' count may vary from release to release of Roku OS; the information here is provided only to give a sense of the kinds of items that the count includes.
     * The 'bscref' count provides a more relevant and accurate indication of the resources that the channel itself controls.
     *
     * The sgnodes all, sgnodes roots, and sgnodes node_ID commands are similar to the getAll() , getRoots() , getRootsMeta(), and getAllMeta() ifSGNodeChildren methods, which can be called on any SceneGraph node.
     *
     * @param {string} id This can be 'all', 'roots', or the id of node(s) in your channel.
     */
    public async sgnodes(id: string): Promise<SceneGraphCommandResponse> {
        return this.exec(`sgnodes ${id}`);
    }


    /**
     * Provides basic node operation performance metrics. This command tracks all node operations by a thread, whether it's being created or an operation on an existing node, and whether it involves a rendezvous.
     * @param {('start'|'clear'|'report'|'stop')} action start - enables counting, clear - resets counters to zero, report - prints current counts with rendezvous as a percentage, stop - disables counting.
     */
    public async sgperf(action: 'start' | 'clear' | 'report' | 'stop'): Promise<SceneGraphCommandResponse> {
        return this.exec(`sgperf ${action}`);
    }

    /**
     * Show the current developer key
     */
    public async showkey(): Promise<SceneGraphCommandResponse> {
        return this.exec('showkey');
    }

    /**
     * Send a literal text sequence.
     * @param text string to be sent to the device.
     */
    public async type(text: string): Promise<SceneGraphCommandResponse> {
        // Add 1 second per character to the max execution timeout because roku is really slow......
        return this.exec(`type ${text}`, { execTimeout: this.execTimeout + (text.length * 1000) });
    }


    /**
     * Changes the number of brightscript warnings displayed on application install.
     * @param warningLimit maximum number of warnings to show
     */
    public async brightscriptWarnings(warningLimit: number): Promise<SceneGraphCommandResponse> {
        return this.exec(`brightscript_warnings ${warningLimit ?? 100}`);
    }


    /**
     * Send any custom command to the SceneGraph debug server.
     *
     * If this command is called and there is no active connection with the device we will attempt to connect.
     * In this case once the command has been executed we will then close the connection.
     * @param {string} command command to be run.
     */
    public async exec(command: string, options: { execTimeout?: number; timeout?: number } = {}): Promise<SceneGraphCommandResponse> {
        let response = this.getBlankResponseObject(command);
        this.logger.log(`Running SceneGraphDebugger command`, { command });

        // Set up a short lived connection if a long lived one has not beed started
        let closeConnectionAfterCommand = !this.connection;
        if (closeConnectionAfterCommand) {
            this.logger.trace('Opening new connection');
            try {
                await this.connect(options);
            } catch (error) {
                response.error = error;
            }
        }

        // Send the commend if we have a connection
        if (this.connection) {
            try {
                response.result.rawResponse = await this.connection.exec(command, options);
                this.logger.debug('Command complete', { command });
            } catch (error) {
                response.error = error;
            }
        }

        // Close the connection if we opened a short lived one
        if (closeConnectionAfterCommand) {
            this.logger.trace('Closing connection');
            await this.end();
        }

        // Tada! Results.
        return response;
    }


    /**
     * Closes the socket connection to the device
     */
    public async end() {
        if (this.connection) {
            this.connection.removeListener('close', this.removeConnection);
            try {
                try {
                    // Asking the host to close is much faster then running our own connections destroy
                    await this.connection.exec('quit', { shellPrompt: 'Quit command received, exiting.' });
                } catch (error) {
                    this.logger.error(`There was a problem quitting the SceneGraphDebugCommand connection`, error);
                }
                this.removeConnection();
            } catch (error) {
                this.removeConnection();
                console.log(error, this.connection);
            }
        }
    }


    /**
     * Returns a simple starting object used for responses
     * @private
     */
    private getBlankResponseObject(command: string): SceneGraphCommandResponse {
        return {
            command: command,
            result: {
                rawResponse: ''
            }
        };
    }
}

export interface SceneGraphCommandResponse<T = undefined> {
    command: string;
    error?: SceneGraphCommandError<T>;
    result: {
        rawResponse: string;
        data?: any;
    };
}

interface SceneGraphCommandError<T = undefined> {
    message: string;
    type: 'socket' | 'device';
    data?: T;
}
