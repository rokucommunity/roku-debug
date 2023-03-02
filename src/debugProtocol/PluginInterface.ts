// inspiration: https://github.com/andywer/typed-emitter/blob/master/index.d.ts
export type Arguments<T> = [T] extends [(...args: infer U) => any]
    ? U
    : [T] extends [void] ? [] : [T];

export default class PluginInterface<TPlugin> {
    constructor(
        plugins = [] as TPlugin[]
    ) {
        for (const plugin of plugins ?? []) {
            this.add(plugin);
        }
    }

    private plugins: Array<PluginContainer<TPlugin>> = [];

    /**
     * Call `event` on plugins
     */
    public async emit<K extends keyof TPlugin & string>(eventName: K, event: Arguments<TPlugin[K]>[0]) {
        for (let { plugin } of this.plugins) {
            if ((plugin as any)[eventName]) {
                await Promise.resolve((plugin as any)[eventName](event));
            }
        }
        return event;
    }

    /**
     * Add a plugin to the end of the list of plugins
     * @param plugin the plugin
     * @param priority the priority for the plugin. Lower number means higher priority. (ex: 1 executes before 5)
     */
    public add<T extends TPlugin = TPlugin>(plugin: T, priority = 1) {
        const container = {
            plugin: plugin,
            priority: priority
        };
        this.plugins.push(container);

        //sort the plugins by priority
        this.plugins.sort((a, b) => {
            return a.priority - b.priority;
        });

        return plugin;
    }

    /**
     * Adds a temporary plugin with a single event hook, and resolve a promise with the event from the next occurance of that event.
     * Once the event fires for the first time, the plugin is unregistered.
     * @param eventName the name of the event to subscribe to
     * @param priority the priority for this event. Lower number means higher priority. (ex: 1 executes before 5)
     */
    public once<TEventType>(eventName: keyof TPlugin, priority = 1): Promise<TEventType> {
        return this.onceIf(eventName, () => true, priority);
    }

    /**
     * Adds a temporary plugin with a single event hook, and resolve a promise with the event from the next occurance of that event.
     * Once the event fires for the first time and the matcher evaluates to true, the plugin is unregistered.
     * @param eventName the name of the event to subscribe to
     * @param matcher a function to call that, when true, will deregister this hander and return the event
     * @param priority the priority for this event. Lower number means higher priority. (ex: 1 executes before 5)
     */
    public onceIf<TEventType>(eventName: keyof TPlugin, matcher: (TEventType) => boolean, priority = 1): Promise<TEventType> {
        return new Promise((resolve) => {
            const tempPlugin = {} as any;
            tempPlugin[eventName] = (event) => {
                if (matcher(event)) {
                    //remove the temp plugin
                    this.remove(tempPlugin);
                    //resolve the promise with this event
                    resolve(event);
                }
            };
            this.add(tempPlugin, priority);
        }) as any;
    }

    /**
     * Remove the specified plugin
     */
    public remove<T extends TPlugin = TPlugin>(plugin: T) {
        for (let i = this.plugins.length - 1; i >= 0; i--) {
            if (this.plugins[i].plugin === plugin) {
                this.plugins.splice(i, 1);
            }
        }
    }

    /**
     * Remove all plugins
     */
    public clear() {
        this.plugins = [];
    }
}

interface PluginContainer<TPlugin> {
    plugin: TPlugin;
    priority: number;
}
