import { Worker } from 'worker_threads';
import { isMainThread, parentPort } from 'worker_threads';
import { BscProject } from '../BscProject';
import { WorkerPool } from './WorkerPool';
import { ThreadRunner } from './ThreadRunner';

//if this script is running in a Worker, start the project runner
/* istanbul ignore next */
if (!isMainThread) {
    const runner = new ThreadRunner(() => {
        return new BscProject();
    });
    runner.run(parentPort);
}

/**
 * A pool of workers that gets pre-baked and reused so we don't pay the worker thread penalty every time we need a new worker.
 */
export const bscProjectWorkerPool = new WorkerPool(() => {
    const worker = new Worker(
        __filename,
        {
            //wire up ts-node if we're running in ts-node
            execArgv: /\.ts$/i.test(__filename)
                ? ['--require', 'ts-node/register']
                /* istanbul ignore next */
                : undefined,
            //don't let worker output flow into our process's stdout (which carries DAP messages in `--dap` mode)
            stdout: true
        }
    );
    worker.stdout.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
    });
    return worker;
});
