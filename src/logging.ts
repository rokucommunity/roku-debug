import { default as defaultLogger } from '@rokucommunity/logger';
import type { Logger } from '@rokucommunity/logger';
import { QueuedTransport } from '@rokucommunity/logger/dist/transports/QueuedTransport';
import { FileTransport } from '@rokucommunity/logger/dist/transports/FileTransport';
import type { LaunchConfiguration } from './LaunchConfiguration';
import * as path from 'path';
import { util } from './util';
import * as fsExtra from 'fs-extra';
import * as dateformat from 'dateformat';
import { standardizePath as s } from './FileUtils';

const logger = defaultLogger.createLogger('[dap]');

//disable colors
logger.enableColor = false;
//force log levels to be same width
logger.consistentLogLevelWidth = true;

export const debugServerLogOutputEventTransport = new QueuedTransport();
/**
 * A transport for logging that allows us to write all log output to a file. This should only be activated if the user has enabled 'debugger' file logging
 */
export const fileTransport = new FileTransport();
//add transport immediately so we can queue log entries
logger.addTransport(debugServerLogOutputEventTransport);
logger.addTransport(fileTransport);

logger.logLevel = 'log';
const createLogger = logger.createLogger.bind(logger) as typeof Logger.prototype.createLogger;

export { logger, createLogger };
export type { Logger, LogMessage, LogLevel } from '@rokucommunity/logger';
export { LogLevelPriority } from '@rokucommunity/logger';

export class FileLoggingManager {

    private fileLogging = {
        rokuDevice: {
            enabled: false,
            filePath: undefined as string
        },
        debugger: {
            enabled: false,
            filePath: undefined as string
        }
    };

    /**
     * Activate this manager and start processing log data
     */
    public activate(config: LaunchConfiguration['fileLogging'], cwd: string) {
        cwd ??= process.cwd();
        this.fileLogging = {
            rokuDevice: {
                enabled: false,
                filePath: undefined
            },
            debugger: {
                enabled: false,
                filePath: undefined
            }
        };
        //diisable all file logging if top-level config is omitted or set to false
        if (!config || (typeof config === 'object' && config?.enabled === false)) {
            return;
        }
        let fileLogging = typeof config === 'object' ? { ...config } : {};

        let defaultDir = path.resolve(
            cwd,
            fileLogging.dir ?? './logs'
        );
        let defaultLogLimit = fileLogging.logLimit ?? Number.MAX_SAFE_INTEGER;

        for (const logType of ['rokuDevice', 'debugger'] as Array<'rokuDevice' | 'debugger'>) {
            //rokuDevice log stuff
            if (util.isNullish(fileLogging[logType]) || fileLogging[logType] === true) {
                fileLogging[logType] = {
                    enabled: true
                };
            }
            const logObj = fileLogging[logType];
            if (typeof logObj === 'object') {
                //enabled unless explicitly disabled
                this.fileLogging[logType].enabled = logObj?.enabled === false ? false : true;
                const logLimit = logObj.logLimit ?? defaultLogLimit;
                let filename = logObj.filename ?? `${logType}.log`;
                let mode = logObj.mode ?? 'session';
                const dir = path.resolve(
                    cwd,
                    logObj.dir ?? defaultDir
                );
                if (mode === 'session') {
                    filename = `${this.getLogDate(new Date())}-${filename}`;
                    //discard the excess session logs that match this filename
                    this.pruneLogDir(dir, filename, logLimit);
                }

                this.fileLogging[logType].filePath = path.resolve(
                    logObj.dir ?? defaultDir,
                    filename
                );
            }
        }

        //if debugger logging is enabled, register the file path which will flush the logs and write all future logs
        if (this.fileLogging.debugger.enabled) {
            fileTransport.setLogFilePath(this.fileLogging.debugger.filePath);

            //debugger logging is disabled. remove the transport so we don't waste memory queueing log data indefinitely
        } else {
            logger.removeTransport(fileTransport);
        }
    }

    /**
     * Delete excess log files matching the given filename (and preceeding timestamp)
     */
    private pruneLogDir(dir: string, filename: string, max: number) {
        const regexp = new RegExp(`\\d\\d\\d\\d-\\d\\d-\\d\\dT\\d\\d∶\\d\\d∶\\d\\d-${filename}`, 'i');
        let files: string[] = [];
        try {
            //get all the files from this dir
            files = fsExtra.readdirSync(dir)
                //keep only the file paths that match our filename pattern
                .filter(x => regexp.test(x))
                .map(x => s`${dir}/${x}`)
                //sort alphabetically
                .sort();
        } catch { }

        if (files.length > max) {
            let filesToDelete = files.splice(0, files.length - max - 1);
            for (const file of filesToDelete) {
                fsExtra.removeSync(file);
            }
            return filesToDelete;
            //discard the keepers in order to get the list of files to delete
        } else {
            return [];
        }
    }

    /**
     * Generate a date string used for log filenames
     */
    private getLogDate(date: Date) {
        return `${dateformat(date, 'yyyy-mm-dd"T"HH∶MM∶ss')}`;
    }

    /**
     * Write output from telnet/IO port from the roku device to the file log (if enabled).
     */
    public writeRokuDeviceLog(logOutput: string) {
        try {
            if (this.fileLogging.rokuDevice.enabled) {
                fsExtra.appendFileSync(this.fileLogging.rokuDevice.filePath, logOutput);
            }
        } catch (e) {
            console.error(e);
        }
    }
}

export type FileLoggingType = 'rokuDevice' | 'debugger';
