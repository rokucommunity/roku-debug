import { ConsoleTransport, Logger } from '@rokucommunity/logger';
import { createLogger } from '../logging';
import type { ProtocolResponse, ProtocolRequest } from './events/ProtocolEvent';
import { HandshakeRequest } from './events/requests/HandshakeRequest';
import type { DebugProtocolServer } from './server/DebugProtocolServer';
import type { BeforeSendResponseEvent, OnServerStartEvent, ProtocolPlugin, ProvideResponseEvent } from './server/ProtocolPlugin';

/**
 * A class that intercepts all debug server events and provides test data for them
 */
export class DebugProtocolServerTestPlugin implements ProtocolPlugin {

    /**
     * A list of responses to be sent by the server in this exact order.
     * One of these will be sent for every `provideResponse` event received.
     */
    private responseQueue: ProtocolResponse[] = [];

    /**
     * Adds a response to the queue, which should be returned from the server in first-in-first-out order, one for each request received by the server
     */
    public pushResponse(response: ProtocolResponse) {
        this.responseQueue.push(response);
    }

    /**
     * A running list of requests received by the server during this test
     */
    public readonly requests: ReadonlyArray<ProtocolRequest> = [];

    /**
     * The most recent request received by the plugin
     */
    public get latestRequest() {
        return this.requests[this.requests.length - 1];
    }

    public getLatestRequest<T>() {
        return this.latestRequest as T;
    }

    /**
     * A running list of responses sent by the server during this test
     */
    public readonly responses: ReadonlyArray<ProtocolResponse> = [];

    /**
     * The most recent response received by the plugin
     */
    public get latestResponse() {
        return this.responses[this.responses.length - 1];
    }

    public server: DebugProtocolServer;

    /**
     * Fired whenever the server starts up
     */
    onServerStart({ server }: OnServerStartEvent) {
        this.server = server;
    }

    /**
     * Whenever the server receives a request, this event allows us to send back a response
     */
    provideResponse(event: ProvideResponseEvent) {
        //store the request for testing purposes
        (this.requests as Array<ProtocolRequest>).push(event.request);

        const response = this.responseQueue.shift();
        //if there's no response, AND this isn't the handshake, fail. (we want the protocol to handle the handshake most of the time)
        if (!response && !(event.request instanceof HandshakeRequest)) {
            throw new Error(`There was no response available to send back for ${event.request.constructor.name}`);
        }
        //force this response to have the current request's ID (for testing purposes)
        if (response) {
            response.data.requestId = event.request.data.requestId;
        }
        event.response = response;
    }

    beforeSendResponse(event: BeforeSendResponseEvent) {
        //store the response for testing purposes
        (this.responses as Array<ProtocolResponse>).push(event.response);
    }
}
