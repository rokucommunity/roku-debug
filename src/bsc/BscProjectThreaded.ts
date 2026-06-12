import { Deferred } from 'brighterscript';
import type { Position, ProgramBuilder, Range } from 'brighterscript';
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
    private errorDeferred = new Deferred();

    /**
     * Has this project finished activating (either resolved or rejected...)
     */
    public get isActivated() {
        return this.activateDeferred.isCompleted;
    }

    /**
     * If an error occurs at any time during the worker's lifetime, it will be caught and stored here.
     */
    public isErrored() {
        return this.errorDeferred.isCompleted;
    }

    private ready() {
        return Promise.race([
            //if we've encountered an error, reject immediately. The underlying error should propagate up
            this.errorDeferred.promise,
            //wait for the activate to finish. This should typically be the only promise that resolves
            this.activateDeferred.promise
        ]);
    }

    public async activate(options: Parameters<ProgramBuilder['run']>[0]) {
        const timeEnd = this.logger.timeStart('log', 'activate');

        // start a new worker thread or get an unused existing thread
        this.worker = bscProjectWorkerPool.getWorker();

        //!!!IMPORTANT!!! this observer must be registered in order to prevent the worker thread from crashing the main thread
        this.worker.on('error', (error) => {
            this.logger.error('Worker encountered an error', error);
            this.errorDeferred.reject(error);
            //!!!IMPORTANT!!! this is required to prevent node from freaking out about an uncaught promise
            this.errorDeferred.promise.catch(e => {
                //do nothing. this is just to prevent node from freaking out about an uncaught promise
            });
        });

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

        return this.activateDeferred.promise;
    }

    /**
     * Get all of the functions available for all scopes for this file.
     */
    public async getScopeFunctionsForFile(options: { relativePath: string }): Promise<Array<ScopeFunction>> {
        return this.sendStandardRequest('getScopeFunctionsForFile', options);
    }

    /**
     * Get the range of the scope that contains the specified position
     */
    public getScopeRange(options: { relativePath: string; position: Position }): Promise<Range> {
        return this.sendStandardRequest('getScopeRange', options);
    }

    /**
     * Send a request with the standard structure
     * @param name the name of the request
     * @param data the array of data to send
     * @returns the response from the request
     */
    private async sendStandardRequest<T>(name: MethodNames<BscProject>, ...data: any[]) {
        await this.ready();
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
