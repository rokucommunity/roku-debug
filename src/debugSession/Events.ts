import type { DebugProtocol } from 'vscode-debugprotocol';
import type { BrightScriptDebugCompileError } from '../CompileErrorProcessor';
import type { LaunchConfiguration } from '../LaunchConfiguration';
import type { ChanperfData } from '../ChanperfTracker';
import type { RendezvousHistory } from '../RendezvousTracker';

export class CompileFailureEvent implements DebugProtocol.Event {
    constructor(compileError: BrightScriptDebugCompileError[]) {
        this.body = compileError;
    }

    public body: any;
    public event: string;
    public seq: number;
    public type: string;
}

export class LogOutputEvent implements DebugProtocol.Event {
    constructor(lines: string) {
        this.body = lines;
        this.event = 'BSLogOutputEvent';
    }

    public body: any;
    public event: string;
    public seq: number;
    public type: string;
}

export class DebugServerLogOutputEvent extends LogOutputEvent {
    constructor(lines: string) {
        super(lines);
        this.event = 'BSDebugServerLogOutputEvent';
    }
}

export class RendezvousEvent implements DebugProtocol.Event {
    constructor(output: RendezvousHistory) {
        this.body = output;
        this.event = 'BSRendezvousEvent';
    }

    public body: RendezvousHistory;
    public event: string;
    public seq: number;
    public type: string;
}

export class ChanperfEvent implements DebugProtocol.Event {
    constructor(output: ChanperfData) {
        this.body = output;
        this.event = 'BSChanperfEvent';
    }

    public body: ChanperfData;
    public event: string;
    public seq: number;
    public type: string;
}

export class LaunchStartEvent implements DebugProtocol.Event {
    constructor(args: LaunchConfiguration) {
        this.body = args;
        this.event = 'BSLaunchStartEvent';
    }

    public body: any;
    public event: string;
    public seq: number;
    public type: string;
}

export enum StoppedEventReason {
    step = 'step',
    breakpoint = 'breakpoint',
    exception = 'exception',
    pause = 'pause',
    entry = 'entry'
}
