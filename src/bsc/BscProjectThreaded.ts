import { Deferred, type ProgramBuilder } from 'brighterscript';
import type { ExtractMethods, DisposableLike } from '../interfaces';
import type { BscProject } from './BscProject';
import { workerPool } from './threading/BscProjectWorkerPool';
import type { MethodNames, WorkerMessage } from './threading/ThreadMessageHandler';
import { ThreadMessageHandler } from './threading/ThreadMessageHandler';
import type { Worker } from 'worker_threads';
import { MessageChannel } from 'worker_threads';
import { util } from '../util';


export class BscProjectThreaded implements ExtractMethods<BscProject> {

    private worker: Worker;

    private messageHandler: ThreadMessageHandler<BscProject>;

    private activateDeferred = new Deferred();

    public async activate(options: Parameters<ProgramBuilder['run']>[0]) {

        // start a new worker thread or get an unused existing thread
        this.worker = workerPool.getWorker();

        //link the message handler to the worker
        this.messageHandler = new ThreadMessageHandler<BscProject>({
            name: 'MainThread',
            port: this.worker,
            onRequest: this.processRequest.bind(this),
            onUpdate: this.processUpdate.bind(this)
        });

        //set up some disposables to be cleaned up
        this.disposables.push(
            this.messageHandler,
            //when disposed, move the worker back to the pool so it can be used again
            () => workerPool.releaseWorker(this.worker)
        );

        //send the request to the worker to activate itself
        try {
            await this.messageHandler.sendRequest('activate', { data: [options] });
            this.activateDeferred.resolve();
        } catch (e) {
            this.activateDeferred.reject(e);
        }
    }

    /**
     * Get all of the functions avaiable for all scopes for this file.
     * @param pkgPath the pkgPath to the file (with or without `pkg:/`)
     * @returns
     */
    public getScopeFunctionsForFile(options: { pkgPath: string }): Promise<string[]> {
        return this.sendStandardRequest('getScopeFunctionsForFile', options);
    }

    /**
     * Send a request with the standard structure
     * @param name the name of the request
     * @param data the array of data to send
     * @returns the response from the request
     */
    private async sendStandardRequest<T>(name: MethodNames<BscProject>, ...data: any[]) {
        await this.activateDeferred.promise;
        const response = await this.messageHandler.sendRequest<T>(name, {
            data: data
        });
        return response.data;
    }

    /**
     * If the client sends a request, it will be processed here
     */
    private processRequest(request: WorkerMessage) {
        //the thread does not currently send any requests
    }

    /**
     * If the client sends an update, it will be processed here
     */
    private processUpdate(update: WorkerMessage) {
        //the thread does not currently send any requests
    }

    /**
     * List of disposables to clean up when this instance is disposed
     */
    public disposables: DisposableLike[] = [];

    /**
     * Clean up all resources used by this instance
     */
    public dispose() {
        util.applyDispose(this.disposables);
    }
}
