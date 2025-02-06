import { Deferred, type ProgramBuilder } from 'brighterscript';
import type { ExtractMethods, DisposableLike, MaybePromise } from '../interfaces';
import type { BscProject, ScopeFunction } from './BscProject';
import { bscProjectWorkerPool } from './threading/BscProjectWorkerPool';
import type { MethodNames, WorkerMessage } from './threading/ThreadMessageHandler';
import { ThreadMessageHandler } from './threading/ThreadMessageHandler';
import type { Worker } from 'worker_threads';
import { util } from '../util';
import { logger } from '../logging';


export class BscProjectThreaded implements ExtractMethods<BscProject> {

    public logger = logger.createLogger('[BscProjectThreaded]');

    private worker: Worker;

    private messageHandler: ThreadMessageHandler<BscProject>;

    private activateDeferred = new Deferred();

    /**
     * Has this project finished activating (either resolved or rejected...)
     */
    public get isActivated() {
        return this.activateDeferred.isCompleted;
    }

    public async activate(options: Parameters<ProgramBuilder['run']>[0]) {
        const timeEnd = this.logger.timeStart('log', 'activate');

        // start a new worker thread or get an unused existing thread
        this.worker = bscProjectWorkerPool.getWorker();

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
            () => bscProjectWorkerPool.releaseWorker(this.worker)
        );

        //send the request to the worker to activate itself
        try {
            await this.messageHandler.sendRequest('activate', { data: [options] });
            this.activateDeferred.resolve();
        } catch (e) {
            this.activateDeferred.reject(e);
        }
        timeEnd();
    }

    /**
     * Get all of the functions avaiable for all scopes for this file.
     * @param relativePath path to the file relative to rootDir
     * @returns
     */
    public getScopeFunctionsForFile(options: { relativePath: string }): MaybePromise<Array<ScopeFunction>> {
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
