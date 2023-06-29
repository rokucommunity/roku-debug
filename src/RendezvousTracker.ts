import { EventEmitter } from 'events';
import * as path from 'path';
import * as replaceLast from 'replace-last';
import type { SourceLocation } from './managers/LocationManager';
import { logger } from './logging';
import { SceneGraphDebugCommandController } from './SceneGraphDebugCommandController';
import * as xml2js from 'xml2js';
import * as request from 'request';
import { util } from './util';
import * as semver from 'semver';

const telnetRendezvousString = 'on\n';

export class RendezvousTracker {
    constructor(
        private deviceInfo
    ) {
        this.clientPathsMap = {};
        this.emitter = new EventEmitter();
        this.filterOutLogs = true;
        this.rendezvousBlocks = {};
        this.rendezvousHistory = this.createNewRendezvousHistory();
    }

    private clientPathsMap: RendezvousClientPathMap;
    private emitter: EventEmitter;
    private filterOutLogs: boolean;
    private rendezvousBlocks: RendezvousBlocks;
    private rendezvousHistory: RendezvousHistory;
    private ecpTrackingEnabled = false;

    /**
     * Determine if the current Roku device supports the ECP rendezvous tracking feature
     */
    public get isEcpRendezvousTrackingSupported() {
        return semver.gte(this.deviceInfo['software-version'] as string, '11.5.0');
    }

    public logger = logger.createLogger(`[${RendezvousTracker.name}]`);
    public on(eventname: 'rendezvous', handler: (output: RendezvousHistory) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'rendezvous', data?) {
        this.emitter.emit(eventName, data);
    }

    public get getRendezvousHistory(): RendezvousHistory {
        return this.rendezvousHistory;
    }

    /**
     * A function that looks up the source location based on debugger information
     */
    private getSourceLocation: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>;

    /**
     * Registers a function that can be used to map a debug location to a source location
     */
    public registerSourceLocator(sourceLocator: (debuggerPath: string, lineNumber: number) => Promise<SourceLocation>) {
        this.getSourceLocation = sourceLocator;
    }

    /**
     * Used to set wether the rendezvous should be filtered from the console output
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.filterOutLogs = !(outputLevel === 'full');
    }

    /**
     * Clears the current rendezvous history
     */
    public clearHistory() {
        this.rendezvousHistory = this.createNewRendezvousHistory();
        this.emit('rendezvous', this.rendezvousHistory);
    }

    private ecpPingTimer: NodeJS.Timer;

    public startEcpPingTimer(): void {
        if (!this.ecpPingTimer) {
            this.ecpPingTimer = setInterval(() => {
                void this.pingEcpRendezvous();
            }, 1000);
        }
    }

    public stopEcpPingTimer() {
        if (this.ecpPingTimer) {
            clearInterval(this.ecpPingTimer);
            this.ecpPingTimer = undefined;
        }
    }

    public async pingEcpRendezvous(): Promise<void> {
        // Get ECP rendezvous data, parse it, and send it to event emitter
        let ecpData = await this.getEcpRendezvous();
        for (let blockInfo of ecpData.items) {
            let duration = ((parseInt(blockInfo.endTime) - parseInt(blockInfo.startTime)) / 1000).toString();
            this.rendezvousBlocks[blockInfo.id] = {
                fileName: await this.updateClientPathMap(blockInfo.file, parseInt(blockInfo.lineNumber)),
                lineNumber: blockInfo.lineNumber
            };
            this.parseRendezvousLog(this.rendezvousBlocks[blockInfo.id], duration);
        }
        this.emit('rendezvous', this.rendezvousHistory);
    }

    /**
     * Determine if rendezvous tracking is enabled via the 8080 telnet command
     */
    public async getIsTelnetRendezvousTrackingEnabled() {
        let host = this.deviceInfo.host as string;
        let sgDebugCommandController = new SceneGraphDebugCommandController(host);
        try {
            let logRendezvousResponse = await sgDebugCommandController.logrendezvous('status');
            return logRendezvousResponse.result.rawResponse?.trim()?.toLowerCase() === 'on';
        } catch (error) {
            this.logger.warn('An error occurred getting logRendezvous');
        } finally {
            await sgDebugCommandController.end();
        }
    }

    /**
     * Determine if rendezvous tracking is enabled via the ECP command
     */
    public async getIsEcpRendezvousTrackingEnabled() {
        let ecpData = await this.getEcpRendezvous();
        return ecpData.trackingEnabled;
    }

    public async activateEcpTracking(): Promise<boolean> {
        //ECP tracking not supported, return early
        if (!this.isEcpRendezvousTrackingSupported) {
            return;
        }

        let isTelnetRendezvousTrackingEnabled = false;
        this.ecpTrackingEnabled = await this.getIsEcpRendezvousTrackingEnabled();
        isTelnetRendezvousTrackingEnabled = await this.getIsTelnetRendezvousTrackingEnabled();

        if (this.ecpTrackingEnabled || isTelnetRendezvousTrackingEnabled) {
            // Toggle ECP tracking off and on to clear the log and then continue tracking
            let untrack = await this.toggleEcpRendezvousTracking('untrack');
            let track = await this.toggleEcpRendezvousTracking('track');
            this.ecpTrackingEnabled = untrack && track;
        }
        if (this.ecpTrackingEnabled) {
            this.logger.log('ecp rendezvous logging is enabled');
            this.startEcpPingTimer();
        }
        return this.ecpTrackingEnabled;
    }

    /**
     * Get the response from an ECP sgrendezvous request from the Roku
     */
    public async getEcpRendezvous(): Promise<EcpRendezvousData> {
        // Send rendezvous query to ECP
        const rendezvousQuery = await util.httpGet(`http://${this.deviceInfo.host}:${this.deviceInfo.remotePort}/query/sgrendezvous`);
        let rendezvousQueryData = rendezvousQuery.body;
        let ecpData: EcpRendezvousData = {
            trackingEnabled: false,
            items: []
        };

        // Parse rendezvous query data
        await new Promise<EcpRendezvousData>((resolve, reject) => {
            xml2js.parseString(rendezvousQueryData, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    const itemArray = result.sgrendezvous.data[0].item;
                    ecpData.trackingEnabled = result.sgrendezvous.data[0]['tracking-enabled'][0];
                    if (Array.isArray(itemArray)) {
                        ecpData.items = itemArray.map((obj: any) => ({
                            id: obj.id[0],
                            startTime: obj['start-tm'][0],
                            endTime: obj['end-tm'][0],
                            lineNumber: obj['line-number'][0],
                            file: obj.file[0]
                        }));
                    }
                    resolve(ecpData);
                }
            });
        });
        return ecpData;
    }

    /**
     * Enable/Disable ECP Rendezvous tracking on the Roku device
     * @returns true if successful, false if there was an issue setting the value
     */
    public async toggleEcpRendezvousTracking(toggle: 'track' | 'untrack'): Promise<boolean> {
        try {
            const response = await util.httpPost(
                `http://${this.deviceInfo.host}:${this.deviceInfo.remotePort}/sgrendezvous/${toggle}`,
                //not sure if we need this, but it works...so probably better to just leave it here
                { body: '' }
            );
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Takes the debug output from the device and parses it for any rendezvous information.
     * Also if consoleOutput was not set to 'full' then any rendezvous output will be filtered from the output.
     * @param log
     * @returns The debug output after parsing
     */
    public async processLog(log: string): Promise<string> {
        let dataChanged = false;
        let lines = log.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let match = /\[sg\.node\.(BLOCK|UNBLOCK)\s{0,}\] Rendezvous\[(\d+)\](?:\s\w+\n|\s\w{2}\s(.*)\((\d+)\)|[\s\w]+(\d+\.\d+)+|\s\w+)/g.exec(line);
            // see the following for an explanation for this regex: https://regex101.com/r/In0t7d/6
            if (match) {
                if (!this.ecpTrackingEnabled) {
                    let [, type, id, fileName, lineNumber, duration] = match;
                    if (type === 'BLOCK') {
                        // detected the start of a rendezvous event
                        this.rendezvousBlocks[id] = {
                            fileName: await this.updateClientPathMap(fileName, parseInt(lineNumber)),
                            lineNumber: lineNumber
                        };
                    } else if (type === 'UNBLOCK' && this.rendezvousBlocks[id]) {
                        // detected the completion of a rendezvous event
                        dataChanged = true;
                        let blockInfo = this.rendezvousBlocks[id];
                        this.parseRendezvousLog(blockInfo, duration);

                        // remove this event from pre history tracking
                        delete this.rendezvousBlocks[id];
                    }
                }
                //  still need to empty logs even if rendezvous tracking through ECP is enabled
                if (this.filterOutLogs) {
                    lines.splice(i--, 1);
                }
            }
        }
        if (dataChanged) {
            this.emit('rendezvous', this.rendezvousHistory);
        }

        return lines.join('\n');
    }

    private parseRendezvousLog(blockInfo: { fileName: string; lineNumber: string }, duration: string) {
        let clientLineNumber: string = this.clientPathsMap[blockInfo.fileName]?.clientLines[blockInfo.lineNumber].toString() ?? blockInfo.lineNumber;
        if (this.rendezvousHistory.occurrences[blockInfo.fileName]) {
            // file is in history
            if (this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber]) {
                // line is in history, just update it
                this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber].totalTime += this.getTime(duration);
                this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber].hitCount++;
            } else {
                // new line to be added to a file in history
                this.rendezvousHistory.occurrences[blockInfo.fileName].occurrences[clientLineNumber] = this.createLineObject(blockInfo.fileName, parseInt(clientLineNumber), duration);
            }
        } else {
            // new file to be added to the history
            this.rendezvousHistory.occurrences[blockInfo.fileName] = {
                occurrences: {
                    [clientLineNumber]: this.createLineObject(blockInfo.fileName, parseInt(clientLineNumber), duration)
                },
                hitCount: 0,
                totalTime: 0,
                type: 'fileInfo',
                zeroCostHitCount: 0
            };
        }

        // how much time to add to the files total time
        let timeToAdd = this.getTime(duration);

        // increment hit count and add to the total time for this file
        this.rendezvousHistory.occurrences[blockInfo.fileName].hitCount++;
        this.rendezvousHistory.hitCount++;

        // increment hit count and add to the total time for the history as a whole
        this.rendezvousHistory.occurrences[blockInfo.fileName].totalTime += timeToAdd;
        this.rendezvousHistory.totalTime += timeToAdd;

        if (timeToAdd === 0) {
            this.rendezvousHistory.occurrences[blockInfo.fileName].zeroCostHitCount++;
            this.rendezvousHistory.zeroCostHitCount++;
        }
    }

    /**
     * Checks the client path map for existing path data and adds new data to the map if not found
     * @param fileName The filename or path parsed from the rendezvous output
     * @param lineNumber The line number parsed from the rendezvous output
     * @returns The file name that best matches the source files if we where able to map it to the source
     */
    private async updateClientPathMap(fileName: string, lineNumber: number): Promise<string> {
        let parsedPath = path.parse(fileName);
        let fileNameAsBrs: string;
        let fileNameAsXml: string;

        // Does the file end in a valid extension or a function name?
        if (parsedPath.ext.toLowerCase() !== '.brs' && parsedPath.ext.toLowerCase() !== '.xml') {
            // file name contained a function name rather then a valid extension
            fileNameAsBrs = replaceLast(fileName, parsedPath.ext, '.brs');
            fileNameAsXml = replaceLast(fileName, parsedPath.ext, '.xml');

            // Check the clint path map for the corrected file name
            if (this.clientPathsMap[fileNameAsBrs]) {
                fileName = fileNameAsBrs;
            } else if (this.clientPathsMap[fileNameAsXml]) {
                fileName = fileNameAsXml;
            }
        }

        if (!this.clientPathsMap[fileName]) {
            // Add new file to client path map
            if (fileNameAsBrs || fileNameAsXml) {
                // File name did not have a valid extension
                // Check for both the .brs and .xml versions of the file starting with .brs
                fileNameAsBrs = (await this.getSourceLocation(fileNameAsBrs, lineNumber)).filePath;
                if (fileNameAsBrs) {
                    fileName = fileNameAsBrs;
                } else {
                    fileNameAsXml = (await this.getSourceLocation(fileNameAsXml, lineNumber)).filePath;
                    if (fileNameAsXml) {
                        fileName = fileNameAsXml;
                    }
                }
            }
            let sourceLocation = await this.getSourceLocation(fileName, lineNumber);
            if (sourceLocation) {
                this.clientPathsMap[fileName] = {
                    clientPath: sourceLocation.filePath,
                    clientLines: {
                        //TODO - should the line be 1 or 0 based?
                        [lineNumber]: sourceLocation.lineNumber
                    }
                };
            }
        } else if (!this.clientPathsMap[fileName].clientLines[lineNumber]) {
            // Add new client line to clint path map
            this.clientPathsMap[fileName].clientLines[lineNumber] = (await this.getSourceLocation(fileName, lineNumber)).lineNumber;
        }

        return fileName;
    }

    /**
     * Helper function used to create a new RendezvousHistory object with default values
     */
    private createNewRendezvousHistory(): RendezvousHistory {
        return {
            hitCount: 0,
            occurrences: {},
            totalTime: 0.00,
            type: 'historyInfo',
            zeroCostHitCount: 0
        };
    }

    /**
     * Helper function to assist in the creation of a RendezvousLineInfo
     * @param fileName processed file name
     * @param lineNumber occurrence line number
     * @param duration how long the rendezvous took to complete, if not supplied it is assumed to be zero
     */
    private createLineObject(fileName: string, lineNumber: number, duration?: string): RendezvousLineInfo {
        return {
            clientLineNumber: lineNumber,
            clientPath: this.clientPathsMap[fileName]?.clientPath ?? fileName,
            hitCount: 1,
            totalTime: this.getTime(duration),
            type: 'lineInfo'
        };
    }

    /**
     * Helper function to convert the duration to a float or return 0.00
     * @param duration how long the rendezvous took to complete, if not supplied it is assumed to be zero
     */
    private getTime(duration?: string): number {
        return duration ? parseFloat(duration) : 0.000;
    }

    /**
     * Destroy/tear down this class
     */
    public destroy() {
        this.stopEcpPingTimer();
    }
}

export interface RendezvousHistory {
    hitCount: number;
    occurrences: Record<string, RendezvousFileInfo>;
    totalTime: number;
    type: ElementType;
    zeroCostHitCount: number;
}

interface RendezvousFileInfo {
    hitCount: number;
    occurrences: Record<string, RendezvousLineInfo>;
    totalTime: number;
    type: ElementType;
    zeroCostHitCount: number;
}

interface RendezvousLineInfo {
    clientLineNumber: number;
    clientPath: string;
    hitCount: number;
    totalTime: number;
    type: ElementType;
}

type RendezvousBlocks = Record<string, {
    fileName: string;
    lineNumber: string;
}>;

interface EcpRendezvousData {
    trackingEnabled: boolean;
    items: EcpRendezvousItem[];
}

interface EcpRendezvousItem {
    id: string;
    startTime: string;
    endTime: string;
    lineNumber: string;
    file: string;
}

type ElementType = 'fileInfo' | 'historyInfo' | 'lineInfo';

type RendezvousClientPathMap = Record<string, {
    clientLines: Record<string, number>;
    clientPath: string;
}>;
