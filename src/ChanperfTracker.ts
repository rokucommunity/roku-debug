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
        this.filterOutLogs = (outputLevel !== 'full');
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
        let chanperfHistory: ChanperfHistory;

        for (let line of lines) {
            let infoAvailableMatch = /channel:\smem=([0-9]+)kib{[a-z]+=([0-9]+),[a-z]+=([0-9]+),[a-z]+=([0-9]+)},\%cpu=([0-9]+){[a-z]+=([0-9]+),[a-z]+=([0-9]+)}/gmi.exec(line);
            // see the following for an explanation for this regex: https://regex101.com/r/AuQOxY/1
            if (infoAvailableMatch) {
                let [fullMatch, totalMemKib, anonMemKib, fileMemKib, sharedMemKib, totalCpuUsage, userCpuUsage, sysCpuUsage] = infoAvailableMatch;
                if (chanperfHistory === undefined) {
                    chanperfHistory = this.createNewChanperfHistory();
                }

                chanperfHistory.missingInfoMessage = null;

                chanperfHistory.memory = {
                    total: parseInt(totalMemKib),
                    anonymous: parseInt(anonMemKib),
                    file: parseInt(fileMemKib),
                    shared: parseInt(sharedMemKib)
                };

                chanperfHistory.memoryEvents.total.push(chanperfHistory.memory.total);
                chanperfHistory.memoryEvents.anonymous.push(chanperfHistory.memory.anonymous);
                chanperfHistory.memoryEvents.file.push(chanperfHistory.memory.file);
                chanperfHistory.memoryEvents.shared.push(chanperfHistory.memory.shared);

                chanperfHistory.cpu = {
                    total: Math.min(parseInt(totalCpuUsage), 100),
                    user: Math.min(parseInt(userCpuUsage), 100),
                    system: Math.min(parseInt(sysCpuUsage), 100)
                };

                chanperfHistory.cpuEvents.total.push(chanperfHistory.cpu.total);
                chanperfHistory.cpuEvents.user.push(chanperfHistory.cpu.user);
                chanperfHistory.cpuEvents.system.push(chanperfHistory.cpu.system);

                if (!this.filterOutLogs) {
                    normalOutput += line + '\n';
                }
                dataChanged = true;
            } else {
                // see the following for an explanation for this regex: https://regex101.com/r/Nwqd5e/1/
                let noInfoAvailableMatch = /channel:\s(mem\sand\scpu\sdata\snot\savailable)/gim.exec(line);

                if (noInfoAvailableMatch) {
                    chanperfHistory = this.createNewChanperfHistory();
                    chanperfHistory.missingInfoMessage = noInfoAvailableMatch[1];

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
            this.chanperfHistory = chanperfHistory;
            this.emit('chanperf-event', chanperfHistory);
        }

        return normalOutput;
    }

    /**
     * Helper function used to create a new ChanperfHistory object with default values
     */
    private createNewChanperfHistory(): ChanperfHistory {
        return {
            memory: {
                total: 0,
                anonymous: 0,
                file: 0,
                shared: 0
            },
            memoryEvents: {
                total: [],
                anonymous: [],
                file: [],
                shared: []
            },
            cpu: {
                total: 0,
                user: 0,
                system: 0
            },
            cpuEvents: {
                total: [],
                user: [],
                system: []
            }
        };
    }
}

export interface ChanperfHistory {
    missingInfoMessage?: string;
    memory: {
        total: number;
        anonymous: number;
        file: number;
        shared: number;
    };
    memoryEvents: {
        total: Array<number>;
        anonymous: Array<number>;
        file: Array<number>;
        shared: Array<number>;
    };
    cpu: {
        total: number;
        user: number;
        system: number;
    };
    cpuEvents: {
        total: Array<number>;
        user: Array<number>;
        system: Array<number>;
    };
}

