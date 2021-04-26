import { EventEmitter } from 'events';

export class ChanperfTracker {
    constructor() {
        this.emitter = new EventEmitter();
        this.filterOutLogs = true;
        this.chanperfHistory = [];
    }

    private emitter: EventEmitter;
    private filterOutLogs: boolean;
    private chanperfHistory: Array<ChanperfEventData>;

    public on(eventname: 'chanperf-event', handler: (output: ChanperfEventData) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'chanperf-event', data: ChanperfEventData) {
        this.emitter.emit(eventName, data);
    }

    public get getChanperfHistory(): Array<ChanperfEventData> {
        return this.chanperfHistory;
    }

    /**
     * Used to set wether the chanperf should be filtered from the console output
     * @param outputLevel the consoleOutput from the launch config
     */
    public setConsoleOutput(outputLevel: string) {
        this.filterOutLogs = (outputLevel !== 'full');
    }

    /**
     * Clears the current chanperf history
     */
    public clearChanperfHistory() {
        this.chanperfHistory = [];
        this.emit('chanperf-event', this.chanperfHistory[0]);
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
        let chanperfHistory: ChanperfEventData;

        for (let line of lines) {
            let infoAvailableMatch = /channel:\smem=([0-9]+)kib{[a-z]+=([0-9]+),[a-z]+=([0-9]+),[a-z]+=([0-9]+)},\%cpu=([0-9]+){[a-z]+=([0-9]+),[a-z]+=([0-9]+)}/gmi.exec(line);
            // see the following for an explanation for this regex: https://regex101.com/r/AuQOxY/1
            if (infoAvailableMatch) {
                let [fullMatch, totalMemKib, anonMemKib, fileMemKib, sharedMemKib, totalCpuUsage, userCpuUsage, sysCpuUsage] = infoAvailableMatch;
                chanperfHistory = this.createNewChanperfHistory();
                chanperfHistory.error = null;

                chanperfHistory.memory = {
                    total: parseInt(totalMemKib) * 1024,
                    anonymous: parseInt(anonMemKib) * 1024,
                    file: parseInt(fileMemKib) * 1024,
                    shared: parseInt(sharedMemKib) * 1024
                };

                chanperfHistory.cpu = {
                    total: Math.min(parseInt(totalCpuUsage), 100),
                    user: Math.min(parseInt(userCpuUsage), 100),
                    system: Math.min(parseInt(sysCpuUsage), 100)
                };

                if (!this.filterOutLogs) {
                    normalOutput += line + '\n';
                }
                this.emit('chanperf-event', chanperfHistory);
                this.chanperfHistory.push(chanperfHistory);
            } else {
                // see the following for an explanation for this regex: https://regex101.com/r/Nwqd5e/1/
                let noInfoAvailableMatch = /channel:\s(mem\sand\scpu\sdata\snot\savailable)/gim.exec(line);

                if (noInfoAvailableMatch) {
                    chanperfHistory = this.createNewChanperfHistory();
                    chanperfHistory.error = { message: noInfoAvailableMatch[1] };

                    if (!this.filterOutLogs) {
                        normalOutput += line + '\n';
                    }
                    this.emit('chanperf-event', chanperfHistory);
                    this.chanperfHistory.push(chanperfHistory);
                } else if (line) {
                    normalOutput += line + '\n';
                }
            }

        }

        return normalOutput;
    }

    /**
     * Helper function used to create a new ChanperfEventData object with default values
     */
    private createNewChanperfHistory(): ChanperfEventData {
        return {
            memory: {
                total: 0,
                anonymous: 0,
                file: 0,
                shared: 0
            },
            cpu: {
                total: 0,
                user: 0,
                system: 0
            }
        };
    }
}

export interface ChanperfEventData {
    error?: {
        message: string;
    };
    memory: {
        total: number;
        anonymous: number;
        file: number;
        shared: number;
    };
    cpu: {
        total: number;
        user: number;
        system: number;
    };
}

