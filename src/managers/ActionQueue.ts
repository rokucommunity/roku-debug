import type { Deferred } from '../util';
import { defer } from '../util';

/**
 * A runner that will keep retrying an action until it succeeds, while also queueing up future actions.
 * Will run until all pending actions are complete.
 */
export class ActionQueue {

    private queueItems: Array<{
        action: () => boolean | Promise<boolean>;
        deferred: Deferred<any>;
        maxTries: number;
        tryCount: number;
    }> = [];

    /**
     * Run an action in the queue.
     * @param action return true or Promise<true> to mark the action as finished
     */
    public async run(action: () => boolean | Promise<boolean>, maxTries: number = undefined) {
        const queueItem = {
            action: action,
            deferred: defer(),
            maxTries: maxTries,
            tryCount: 0
        };
        this.queueItems.push(queueItem);
        await this._runActions();
        return queueItem.deferred.promise;
    }

    private isRunning = false;

    private async _runActions() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        while (this.queueItems.length > 0) {
            const queueItem = this.queueItems[0];
            try {
                queueItem.tryCount++;
                const isFinished = await Promise.resolve(
                    queueItem.action()
                );

                if (isFinished) {
                    this.queueItems.shift();
                    queueItem.deferred.resolve();
                } else if (typeof queueItem.maxTries === 'number' && queueItem.tryCount >= queueItem.maxTries) {
                    throw new Error(`Exceeded the ${queueItem.maxTries} maximum tries for this ActionQueue action`);
                }
            } catch (error) {
                this.queueItems.shift();
                queueItem.deferred.reject(error);
            }
        }
        this.isRunning = false;
    }

    public destroy() {
        this.isRunning = false;
        this.queueItems = [];
    }
}
