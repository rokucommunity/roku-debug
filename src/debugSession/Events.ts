/* eslint-disable @typescript-eslint/no-useless-constructor */
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { BSDebugDiagnostic } from '../CompileErrorProcessor';
import type { LaunchConfiguration } from '../LaunchConfiguration';
import type { ChanperfData } from '../ChanperfTracker';
import type { RendezvousHistory } from '../RendezvousTracker';

export class CustomEvent<T> implements DebugProtocol.Event {
    public constructor(body: T) {
        this.body = body;
        this.event = this.constructor.name;
    }
    /**
     * The body (payload) of the event.
     */
    public body: T;
    /**
     * The name of the event. This name is how the client identifies the type of event and how to handle it
     */
    public event: string;
    /**
     * The type of ProtocolMessage. Hardcoded to 'event' for all custom events
     */
    public type = 'event';
    public seq: number;
}

/**
 * Emitted when compile errors were encountered during the current debug session,
 * usually during the initial sideload process as the Roku is compiling the app.
 */
export class DiagnosticsEvent extends CustomEvent<{ diagnostics: BSDebugDiagnostic[] }> {
    constructor(diagnostics: BSDebugDiagnostic[]) {
        super({ diagnostics });
    }
}

/**
 * Is the object a `DiagnosticsEvent`
 */
export function isDiagnosticsEvent(event: any): event is DiagnosticsEvent {
    return !!event && event.event === DiagnosticsEvent.name;
}

/**
 * A line of log ouptut from the Roku device
 */
export class LogOutputEvent extends CustomEvent<{ line: string }> {
    constructor(line: string) {
        super({ line });
    }
}

/**
 * Is the object a `LogOutputEvent`
 */
export function isLogOutputEvent(event: any): event is LogOutputEvent {
    return !!event && event.event === LogOutputEvent.name;
}

/**
 * Log output from the debug server. These are logs emitted from NodeJS from the various RokuCommunity tools
 */
export class DebugServerLogOutputEvent extends CustomEvent<{ line: string }> {
    constructor(line: string) {
        super({ line });
    }
}

/**
 * Is the object a `DebugServerLogOutputEvent`
 */
export function isDebugServerLogOutputEvent(event: any): event is DebugServerLogOutputEvent {
    return !!event && event.event === DebugServerLogOutputEvent.name;
}

/**
 * Emitted when a rendezvous has occurred. Contains the full history of rendezvous since the start of the current debug session
 */
export class RendezvousEvent extends CustomEvent<RendezvousHistory> {
    constructor(output: RendezvousHistory) {
        super(output);
    }
}

/**
 * Is the object a `RendezvousEvent`
 */
export function isRendezvousEvent(event: any): event is RendezvousEvent {
    return !!event && event.event === RendezvousEvent.name;
}

/**
 * Emitted anytime the debug session receives chanperf data.
 */
export class ChanperfEvent extends CustomEvent<ChanperfData> {
    constructor(output: ChanperfData) {
        super(output);
    }
}

/**
 * Is the object a `ChanperfEvent`
 */
export function isChanperfEvent(event: any): event is ChanperfEvent {
    return !!event && event.event === ChanperfEvent.name;
}


/**
 * Emitted when the launch sequence first starts. This is right after the debug session receives the `launch` request,
 * which happens before any zipping, sideloading, etc.
 */
export class LaunchStartEvent extends CustomEvent<LaunchConfiguration> {
    constructor(launchConfiguration: LaunchConfiguration) {
        super(launchConfiguration);
    }
}

/**
 * Is the object a `LaunchStartEvent`
 */
export function isLaunchStartEvent(event: any): event is LaunchStartEvent {
    return !!event && event.event === LaunchStartEvent.name;
}

/**
 * Emitted once the channel has been sideloaded to the channel and the session is ready to start actually debugging.
 */
export class ChannelPublishedEvent extends CustomEvent<{ launchConfiguration: LaunchConfiguration }> {
    constructor(
        launchConfiguration: LaunchConfiguration
    ) {
        super({ launchConfiguration });
    }
}

/**
 * Is the object a `ChannelPublishedEvent`
 */
export function isChannelPublishedEvent(event: any): event is ChannelPublishedEvent {
    return !!event && event.event === ChannelPublishedEvent.name;
}

/**
 * Event that asks the client to execute a command.
 */
export class CustomRequestEvent<T = any, R = T & { name: string; requestId: number }> extends CustomEvent<R> {
    constructor(body: R) {
        super(body);
    }
}

/**
 * Is the object a `CustomRequestEvent`
 */
export function isCustomRequestEvent(event: any): event is CustomRequestEvent {
    return !!event && event.event === CustomRequestEvent.name;
}

export function isExecuteTaskCustomRequest(event: any): event is CustomRequestEvent<{ task: string }> {
    return !!event && event.event === CustomRequestEvent.name && event.body.name === 'executeTask';
}

export function isShowPopupMessageCustomRequest(event: any): event is CustomRequestEvent<{ message: string; severity: 'error' | 'warn' | 'info'; modal: boolean; actions: string[] }> {
    return !!event && event.event === CustomRequestEvent.name && event.body.name === 'showPopupMessage';
}

export enum ClientToServerCustomEventName {
    customRequestEventResponse = 'customRequestEventResponse'
}

export enum StoppedEventReason {
    step = 'step',
    breakpoint = 'breakpoint',
    exception = 'exception',
    pause = 'pause',
    entry = 'entry',
    goto = 'goto',
    functionBreakpoint = 'function breakpoint',
    dataBreakpoint = 'data breakpoint',
    instructionBreakpoint = 'instruction breakpoint'
}
