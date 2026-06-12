import { EventEmitter } from 'events';
import * as path from 'path';
import * as replaceLast from 'replace-last';
import type { SourceLocation } from './managers/LocationManager';
import { logger } from './logging';
import { SceneGraphDebugCommandController } from './SceneGraphDebugCommandController';
import * as xml2js from 'xml2js';
import { util } from './util';
import * as semver from 'semver';
import type { DeviceInfo } from 'roku-deploy';
import type { LaunchConfiguration } from './LaunchConfiguration';

export class RendezvousTracker {
    constructor(
        private deviceInfo: DeviceInfo,
        private launchConfiguration: LaunchConfiguration
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

    /**
     * Where should the rendezvous data be tracked from? If ecp, then the ecp ping data will be reported. If telnet, then any
     * rendezvous data from telnet will reported. If 'off', then no data will be reported
     */
    private trackingSource: 'telnet' | 'ecp' | 'off' = 'off';

    /**
     * Determine if the current Roku device supports the ECP rendezvous tracking feature
     */
    public get doesHostSupportEcpRendezvousTracking() {
        let softwareVersion: string = this.deviceInfo?.softwareVersion ?? '0.0.0';
        if (!semver.valid(softwareVersion)) {
            softwareVersion = '0.0.0';
        }
        return semver.gte(softwareVersion, '11.5.0');
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
        this.logger.log('Clear rendezvous history');
        this.rendezvousHistory = this.createNewRendezvousHistory();
        this.emit('rendezvous', this.rendezvousHistory);
    }

    private ecpPingTimer: NodeJS.Timer;

    public startEcpPingTimer(): void {
        this.logger.log('Start ecp ping timer');
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
        try {
            // Get ECP rendezvous data, parse it, and send it to event emitter
            let ecpData = await this.getEcpRendezvous();
            const items = ecpData?.items ?? [];
            if (items.length > 0) {
                for (let blockInfo of items) {
                    let duration = ((parseInt(blockInfo.endTime) - parseInt(blockInfo.startTime)) / 1000).toString();
                    this.rendezvousBlocks[blockInfo.id] = {
                        fileName: await this.updateClientPathMap(blockInfo.file, parseInt(blockInfo.lineNumber)),
                        lineNumber: blockInfo.lineNumber
                    };
                    this.parseRendezvousLog(this.rendezvousBlocks[blockInfo.id], duration);
                }
                this.emit('rendezvous', this.rendezvousHistory);
            }
        } catch (e) {
            //if there was an error pinging rendezvous, log the error but don't bring down the app
            console.error('There was an error fetching rendezvous data', e?.stack);
        }
    }

    /**
     * Determine if rendezvous tracking is enabled via the 8080 telnet command
     */
    public async getIsTelnetRendezvousTrackingEnabled() {
        return (await this.runSGLogrendezvousCommand('status'))?.trim()?.toLowerCase() === 'on';
    }

    /**
     * Run a SceneGraph logendezvous 8080 command and get the text output
     */
    private async runSGLogrendezvousCommand(command: 'status' | 'on' | 'off'): Promise<string> {
        let sgDebugCommandController = new SceneGraphDebugCommandController(this.launchConfiguration.host, this.launchConfiguration.sceneGraphDebugCommandsPort);
        try {
            this.logger.info(`port 8080 command: logrendezvous ${command}`);
            return (await sgDebugCommandController.logrendezvous(command)).result.rawResponse;
        } catch (error) {
            this.logger.warn(`An error occurred running SG command "${command}"`, error);
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

    public async activate(): Promise<boolean> {
        //if ECP tracking is supported, turn that on
        if (this.doesHostSupportEcpRendezvousTracking) {
            this.logger.log('Activating rendezvous tracking');
            // Toggle ECP tracking off and on to clear the log and then continue tracking
            let untrack = await this.toggleEcpRendezvousTracking('untrack');
            let track = await this.toggleEcpRendezvousTracking('track');

            const isEcpTrackingEnabled = untrack && track && await this.getIsEcpRendezvousTrackingEnabled();
            if (isEcpTrackingEnabled) {
                this.logger.info('ECP tracking is enabled');
                this.trackingSource = 'ecp';
                this.startEcpPingTimer();

                //disable telnet rendezvous tracking since ECP is working
                try {
                    await this.runSGLogrendezvousCommand('off');
                } catch { }
                return true;
            }
        }

        this.logger.log('ECP tracking is not supported or had an issue. Trying to use telnet rendezvous tracking');
        //ECP tracking is not supported (or had an issue). Try enabling telnet rendezvous tracking (that only works with run_as_process=0, but worth a try...)
        await this.runSGLogrendezvousCommand('on');
        if (await this.getIsTelnetRendezvousTrackingEnabled()) {
            this.logger.log('telnet rendezvous tracking is enabled');
            this.trackingSource = 'telnet';
            return true;
        } else {
            this.logger.log('telnet rendezvous tracking is disabled or encountered an issue. rendezvous tracking is now disabled');
        }
        return false;
    }

    /**
     * Get the response from an ECP sgrendezvous request from the Roku
     */
    public async getEcpRendezvous(): Promise<EcpRendezvousData> {
        const url = `http://${this.launchConfiguration.host}:${this.launchConfiguration.remotePort}/query/sgrendezvous`;
        this.logger.trace(`Sending ECP rendezvous request:`, url);
        // Send rendezvous query to ECP
        const rendezvousQuery = await util.httpGet(url);
        let rendezvousQueryData = rendezvousQuery.body as string;
        let ecpData: EcpRendezvousData = {
            trackingEnabled: false,
            items: []
        };

        this.logger.trace('Parsing rendezvous response', rendezvousQuery);
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
        this.logger.trace('Parsed ECP rendezvous data:', ecpData);
        return ecpData;
    }

    /**
     * Enable/Disable ECP Rendezvous tracking on the Roku device
     * @returns true if the request succeeded, false if there was an issue setting the value, and does _not_ indicate the final enabled/disabled state of the setting.
     */
    public async toggleEcpRendezvousTracking(toggle: 'track' | 'untrack'): Promise<boolean> {
        try {
            this.logger.log(`Sending ecp sgrendezvous request: ${toggle}`);
            const response = await util.httpPost(
                `http://${this.launchConfiguration.host}:${this.launchConfiguration.remotePort}/sgrendezvous/${toggle}`,
                //not sure if we need this, but it works...so probably better to just leave it here
                { body: '' }
            );
            //this was successful if we got a 200 level status code (200-299)
            return response.statusCode >= 200 && response.statusCode < 300;
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
                if (this.trackingSource === 'telnet') {
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
    public async destroy() {
        this.emitter?.removeAllListeners();
        this.stopEcpPingTimer();
        //turn off ECP rendezvous tracking
        if (this.doesHostSupportEcpRendezvousTracking) {
            await this.toggleEcpRendezvousTracking('untrack');
        }

        //turn off telnet rendezvous tracking
        try {
            await this.runSGLogrendezvousCommand('off');
        } catch (e) {
            this.logger.error('Failed to disable logrendezvous over 8080', e);
        }
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
