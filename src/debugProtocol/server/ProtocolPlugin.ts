import type { DebugProtocolServer } from './DebugProtocolServer';
import type { ProtocolResponse } from '../events/zzresponsesOld/ProtocolResponse';
import type { Socket } from 'net';
import type { ProtocolRequest } from '../events/requests/ProtocolRequest';

export interface ProtocolPlugin {
    onClientConnected?: Handler<OnClientConnectedEvent>;

    provideRequest?: Handler<ProvideRequestEvent>;
    provideResponse: Handler<ProvideResponseEvent>;

    beforeSendResponse?: Handler<BeforeSendResponseEvent>;
    afterSendResponse?: Handler<AfterSendResponseEvent>;
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

