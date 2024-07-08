import type { DebugProtocolServer } from './DebugProtocolServer';
import type { Socket } from 'net';
import type { ProtocolRequest, ProtocolResponse } from '../events/ProtocolEvent';
import { DebugProtocolServerTestPlugin } from '../DebugProtocolServerTestPlugin.spec';

export interface ProtocolServerPlugin {
    onServerStart?: Handler<OnServerStartEvent>;
    onClientConnected?: Handler<OnClientConnectedEvent>;

    provideRequest?: Handler<ProvideRequestEvent>;
    provideResponse?: Handler<ProvideResponseEvent>;

    beforeSendResponse?: Handler<BeforeSendResponseEvent>;
    afterSendResponse?: Handler<AfterSendResponseEvent>;
}

export interface OnServerStartEvent {
    server: DebugProtocolServer;
}

export interface OnClientConnectedEvent {
    server: DebugProtocolServer;
    client: Socket;
}

export interface ProvideRequestEvent {
    server: DebugProtocolServer;
    buffer: Buffer;
    /**
     * The plugin should provide this property
     */
    request?: ProtocolRequest;
}
export interface ProvideResponseEvent {
    server: DebugProtocolServer;
    request: ProtocolRequest;
    /**
     * The plugin should provide this property
     */
    response?: ProtocolResponse;
}

export interface BeforeSendResponseEvent {
    server: DebugProtocolServer;
    response: ProtocolResponse;
}
export type AfterSendResponseEvent = BeforeSendResponseEvent;

export type Handler<T, R = void> = (event: T) => R;
