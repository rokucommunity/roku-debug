import type { MessagePort } from 'worker_threads';
import type { MethodNames, WorkerMessage } from './ThreadMessageHandler';
import { ThreadMessageHandler } from './ThreadMessageHandler';

/**
 * Runner logic for Running a Project in a worker thread.
 */
export class ThreadRunner<T extends ThreadRunnerSubject> {

    public constructor(
        private subjectFactory: () => T
    ) {

    }

    //collection of interceptors that will be called when events are fired
    private requestInterceptors = {} as Record<MethodNames<T>, (data: any) => any>;

    /**
     * The instance of the object this runner will communicate with. It should have methods with the same names as the request being sent.
     */
    private subject: T;

    private messageHandler: ThreadMessageHandler<T>;

    public run(parentPort: MessagePort) {
        this.messageHandler = new ThreadMessageHandler({
            name: 'WorkerThread',
            port: parentPort,
            onRequest: async (request: WorkerMessage) => {
                try {
                    //if we have a request interceptor registered for this event, call it
                    this.requestInterceptors[request.name]?.(request.data);

                    //only the LspProject interface method names will be passed as request names, so just call those functions on the Project class directly
                    let responseData = await this.subject[request.name](...request.data ?? []);
                    this.messageHandler.sendResponse(request, { data: responseData });

                    //we encountered a runtime crash. Pass that error along as the response to this request
                } catch (e) {
                    const error: Error = e as unknown as any;
                    this.messageHandler.sendResponse(request, { error: error });
                }
            },
            onUpdate: (update) => {

            }
        });

        (this.requestInterceptors as any).activate = this.onActivate.bind(this);
    }

    /**
     * Fired anytime we get an `activate` request from the client. This allows us to clean up the previous project and make a new one
     */
    private onActivate() {
        //clean up any existing project
        void this.subject?.dispose();

        //make a new instance of the subject
        this.subject = this.subjectFactory();
    }
}

export interface ThreadRunnerSubject {
    /**
     * Called whenever a new subject has been activated
     */
    activate(...args: any[]): void | Promise<any>;
    /**
     * Called whenever a subject will no longer be used. Allows for cleaning up a subject.
     */
    dispose(): void | Promise<any>;
}
