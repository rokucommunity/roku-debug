import { ConsoleTransport, Logger } from '@rokucommunity/logger';
import { createLogger } from '../logging';
import { isProtocolUpdate } from './client/DebugProtocolClient';
import type { ProtocolResponse, ProtocolRequest, ProtocolUpdate } from './events/ProtocolEvent';
import { HandshakeRequest } from './events/requests/HandshakeRequest';
import type { DebugProtocolServer } from './server/DebugProtocolServer';
import type { BeforeSendResponseEvent, OnServerStartEvent, ProtocolServerPlugin, ProvideResponseEvent } from './server/DebugProtocolServerPlugin';

/**
 * A class that intercepts all debug server events and provides test data for them
 */
export class DebugProtocolServerTestPlugin implements ProtocolServerPlugin {

    /**
     * A list of responses or updates to be sent by the server in this exact order.
     * One of these will be sent for every `provideResponse` event received. Any leading ProtocolUpdate entries will be sent as soon as seen.
     * For example, if the array is `[Update1, Update2, Response1, Update3]`, when the `provideResponse` event is triggered, we will first send
     * `Update1` and `Update2`, then provide `Response1`. `Update3` will be triggered when the next `provideResponse` is requested, or if `.flush()` is called
     */
    private responseUpdateQueue: Array<ProtocolResponse | ProtocolUpdate> = [];

    /**
     * Adds a response to the queue, which should be returned from the server in first-in-first-out order, one for each request received by the server
     */
    public pushResponse(event: ProtocolResponse) {
        this.responseUpdateQueue.push(event);
    }

    /**
     * Adds a ProtocolUpdate to the queue. Any leading updates are send to the client anytime `provideResponse` is triggered, or when `.flush()` is called
     */
    public pushUpdate(event: ProtocolUpdate) {
        this.responseUpdateQueue.push(event);
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
        return this.latestRequest as unknown as T;
    }

    /**
     * Get the request at the specified index. Negative indexes count back from the last item in the array
     */
    public getRequest(index: number) {
        if (index < 0) {
            //add the negative index to the length to "subtract" from the end
            index = this.requests.length + index;
        }
        return this.requests[index];
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
     * Flush all leading updates in the queue
     */
    public async flush() {
        while (isProtocolUpdate(this.responseUpdateQueue[0])) {
            await this.server.sendUpdate(this.responseUpdateQueue.shift());
        }
    }

    /**
     * Whenever the server receives a request, this event allows us to send back a response
     */
    async provideResponse(event: ProvideResponseEvent) {
        //store the request for testing purposes
        (this.requests as Array<ProtocolRequest>).push(event.request);

        //flush leading updates
        await this.flush();

        const response = this.responseUpdateQueue.shift();
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
