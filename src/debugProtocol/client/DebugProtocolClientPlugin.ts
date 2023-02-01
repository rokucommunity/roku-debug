import type { DebugProtocolClient } from './DebugProtocolClient';
import type { Socket } from 'net';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from '../events/ProtocolEvent';

export interface DebugProtocolClientPlugin {
    onServerConnected?(event: OnServerConnectedEvent): void | Promise<any>;

    beforeSendRequest?(event: BeforeSendRequestEvent): void | Promise<any>;
    afterSendRequest?(event: AfterSendRequestEvent): void | Promise<any>;

    provideResponseOrUpdate?(event: ProvideResponseOrUpdateEvent): void | Promise<any>;

    onUpdate?(event: OnUpdateEvent): void | Promise<any>;
    onResponse?(event: OnResponseEvent): void | Promise<any>;

    beforeHandleUpdate?(event: BeforeHandleUpdateEvent): void | Promise<any>;
}

export interface OnServerConnectedEvent {
    client: DebugProtocolClient;
    server: Socket;
}

export interface ProvideResponseOrUpdateEvent {
    client: DebugProtocolClient;
    activeRequests: Map<number, ProtocolRequest>;
    buffer: Readonly<Buffer>;
    /**
     * The plugin should provide this property
     */
    responseOrUpdate?: ProtocolResponse | ProtocolUpdate;
}

export interface BeforeSendRequestEvent {
    client: DebugProtocolClient;
    request: ProtocolRequest;
}
export type AfterSendRequestEvent = BeforeSendRequestEvent;

export interface OnUpdateEvent {
    client: DebugProtocolClient;
    update: ProtocolUpdate;
}

export interface BeforeHandleUpdateEvent {
    client: DebugProtocolClient;
    update: ProtocolUpdate;
}

export interface OnResponseEvent {
    client: DebugProtocolClient;
    response: ProtocolResponse;
}
export type Handler<T, R = void> = (event: T) => R;

