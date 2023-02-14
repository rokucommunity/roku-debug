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
