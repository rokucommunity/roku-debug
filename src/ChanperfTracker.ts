import { EventEmitter } from 'events';

export class ChanperfTracker {
    constructor() {
        this.emitter = new EventEmitter();
        this.filterOutLogs = true;
        this.history = [];
    }

    private emitter: EventEmitter;
    private filterOutLogs: boolean;
    private history: Array<ChanperfData>;

    public on(eventname: 'chanperf', handler: (output: ChanperfData) => void);
    public on(eventName: string, handler: (payload: any) => void) {
        this.emitter.on(eventName, handler);
        return () => {
            if (this.emitter !== undefined) {
                this.emitter.removeListener(eventName, handler);
            }
        };
    }

    private emit(eventName: 'chanperf', data: ChanperfData) {
        this.emitter.emit(eventName, data);
    }

    public get getHistory(): Array<ChanperfData> {
        return this.history;
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
    public clearHistory() {
        this.history = [];
        this.emit('chanperf', this.history[0]);
    }

    /**
     * Takes the debug output from the device and parses it for any chanperf information.
     * Also if consoleOutput was not set to 'full' then any chanperf output will be filtered from the output.
     * @param log
     * @returns The debug output after parsing
     */
    public processLog(log: string): string {
        let lines = log.split('\n');
        let chanperfEventData: ChanperfData;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let infoAvailableMatch = /channel:\smem=([0-9]+)kib{[a-z]+=([0-9]+),[a-z]+=([0-9]+),[a-z]+=([0-9]+)(,[a-z]+=([0-9]+))?},\%cpu=([0-9]+){[a-z]+=([0-9]+),[a-z]+=([0-9]+)}/gmi.exec(line);
            // see the following for an explanation for this regex: https://regex101.com/r/3HKIO0/2
            if (infoAvailableMatch) {
                let [fullMatch, totalMemKib, anonMemKib, fileMemKib, sharedMemKib, swapFullMatch, swapMemKib, totalCpuUsage, userCpuUsage, sysCpuUsage] = infoAvailableMatch;
                chanperfEventData = this.createNewChanperfEventData();
                chanperfEventData.error = null;

                chanperfEventData.memory = {
                    total: this.toBytes(totalMemKib),
                    anonymous: this.toBytes(anonMemKib),
                    file: this.toBytes(fileMemKib),
                    shared: this.toBytes(sharedMemKib),
                    swap: this.toBytes(swapMemKib)
                };

                chanperfEventData.cpu = {
                    total: Math.min(parseInt(totalCpuUsage), 100),
                    user: Math.min(parseInt(userCpuUsage), 100),
                    system: Math.min(parseInt(sysCpuUsage), 100)
                };

                if (this.filterOutLogs) {
                    lines.splice(i--, 1);
                }
                this.emit('chanperf', chanperfEventData);
                this.history.push(chanperfEventData);
            } else {
                // see the following for an explanation for this regex: https://regex101.com/r/Nwqd5e/1/
                let noInfoAvailableMatch = /channel:\s(mem\sand\scpu\sdata\snot\savailable)/gim.exec(line);

                if (noInfoAvailableMatch) {
                    chanperfEventData = this.createNewChanperfEventData();
                    chanperfEventData.error = { message: noInfoAvailableMatch[1] };

                    if (this.filterOutLogs) {
                        lines.splice(i--, 1);
                    }
                    this.emit('chanperf', chanperfEventData);
                    this.history.push(chanperfEventData);
                }
            }
        }

        return lines.join('\n');
    }

    private toBytes(KiB): number {
        let amount = parseInt(KiB);
        return isNaN(amount) ? 0 : amount * 1024;
    }

    /**
     * Helper function used to create a new ChanperfData object with default values
     */
    private createNewChanperfEventData(): ChanperfData {
        return {
            memory: {
                total: 0,
                anonymous: 0,
                file: 0,
                shared: 0,
                swap: 0
            },
            cpu: {
                total: 0,
                user: 0,
                system: 0
            }
        };
    }
}

export interface ChanperfData {
    error?: {
        message: string;
    };
    memory: {
        total: number;
        anonymous: number;
        file: number;
        shared: number;
        swap: number;
    };
    cpu: {
        total: number;
        user: number;
        system: number;
    };
}

