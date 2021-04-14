import { EventEmitter } from 'events';

export class ChanperfTracker {
    constructor() {
        this.emitter = new EventEmitter();
        this.filterOutLogs = true;
        this.chanperfHistory = this.createNewChanperfHistory();
    }

    private emitter: EventEmitter;
    private filterOutLogs: boolean;
    private chanperfHistory: ChanperfHistory;

    public on(eventname: 'chanperf-event', handler: (output: ChanperfHistory) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'chanperf-event', data?) {
        this.emitter.emit(eventName, data);
    }

    public get getChanperfHistory(): ChanperfHistory {
        return this.chanperfHistory;
    }

    /**
     * Used to set wether the chanperf should be filtered from the console output
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.filterOutLogs = !(outputLevel === 'full');
    }

    /**
     * Clears the current chanperf history
     */
    public clearChanperfHistory() {
        this.chanperfHistory = this.createNewChanperfHistory();
        this.emit('chanperf-event', this.chanperfHistory);
    }

    /**
     * Takes the debug output from the device and parses it for any chanperf information.
     * Also if consoleOutput was not set to 'full' then any chanperf output will be filtered from the output.
     * @param logLine
     * @returns The debug output after parsing
     */
    public processLogLine(logLine: string): string {
        let dataChanged = false;
        let lines = logLine.split('\n');
        let normalOutput = '';

        for (let line of lines) {
            let infoAvailableMatch = /channel: *mem=([0-9]+)kib{[a-z]+=([0-9]+),[a-z]+=([0-9]+),[a-z]+=([0-9]+)},\%cpu=([0-9]+){[a-z]+=([0-9]+),[a-z]+=([0-9]+)}/gmi.exec(line);
            // see the following for an explanation for this regex: https://regex101.com/r/AuQOxY/1
            if (infoAvailableMatch) {
                let [fullMatch, totalMemKib, anonMemKib, fileMemKib, sharedMemKib, totalCpuUsage, userCpuUsage, sysCpuUsage] = infoAvailableMatch;

                this.chanperfHistory.missingInfoMessage = null;
                this.chanperfHistory.totalMemKib = parseInt(totalMemKib);
                this.chanperfHistory.anonMemKib = parseInt(anonMemKib);
                this.chanperfHistory.fileMemKib = parseInt(fileMemKib);
                this.chanperfHistory.sharedMemKib = parseInt(sharedMemKib);
                this.chanperfHistory.totalCpuUsage = parseInt(totalCpuUsage);
                this.chanperfHistory.userCpuUsage = parseInt(userCpuUsage);
                this.chanperfHistory.sysCpuUsage = parseInt(sysCpuUsage);

                this.chanperfHistory.dataSet.totalMemKib.push(parseInt(totalMemKib));
                this.chanperfHistory.dataSet.anonMemKib.push(parseInt(anonMemKib));
                this.chanperfHistory.dataSet.fileMemKib.push(parseInt(fileMemKib));
                this.chanperfHistory.dataSet.sharedMemKib.push(parseInt(sharedMemKib));
                this.chanperfHistory.dataSet.totalCpuUsage.push(parseInt(totalCpuUsage));
                this.chanperfHistory.dataSet.userCpuUsage.push(parseInt(userCpuUsage));
                this.chanperfHistory.dataSet.sysCpuUsage.push(parseInt(sysCpuUsage));

                if (!this.filterOutLogs) {
                    normalOutput += line + '\n';
                }
                dataChanged = true;
            } else {
                // see the following for an explanation for this regex: https://regex101.com/r/Nwqd5e/1/
                let noInfoAvailableMatch = /channel: *(mem *and *cpu *data *not *available)/gim.exec(line);

                if (noInfoAvailableMatch) {
                    this.chanperfHistory.missingInfoMessage = noInfoAvailableMatch[1];

                    if (!this.filterOutLogs) {
                        normalOutput += line + '\n';
                    }
                    dataChanged = true;
                } else if (line) {
                    normalOutput += line + '\n';
                }
            }

        }

        if (dataChanged) {
            this.emit('chanperf-event', this.chanperfHistory);
        }

        return normalOutput;
    }

    /**
     * Helper function used to create a new ChanperfHistory object with default values
     */
    private createNewChanperfHistory(): ChanperfHistory {
        return {
            totalMemKib: 0,
            anonMemKib: 0,
            fileMemKib: 0,
            sharedMemKib: 0,
            totalCpuUsage: 0,
            userCpuUsage: 0,
            sysCpuUsage: 0,
            dataSet: {
                totalMemKib: [],
                anonMemKib: [],
                fileMemKib: [],
                sharedMemKib: [],
                totalCpuUsage: [],
                userCpuUsage: [],
                sysCpuUsage: []
            }
        };
    }
}

export interface ChanperfHistory {
    missingInfoMessage?: string;
    totalMemKib: number;
    anonMemKib: number;
    fileMemKib: number;
    sharedMemKib: number;
    totalCpuUsage: number;
    userCpuUsage: number;
    sysCpuUsage: number;
    dataSet: ChanperfDataSet;
}

interface ChanperfDataSet {
    totalMemKib: Array<number>;
    anonMemKib: Array<number>;
    fileMemKib: Array<number>;
    sharedMemKib: Array<number>;
    totalCpuUsage: Array<number>;
    userCpuUsage: Array<number>;
    sysCpuUsage: Array<number>;
}
