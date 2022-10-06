// inspiration: https://github.com/andywer/typed-emitter/blob/master/index.d.ts
export type Arguments<T> = [T] extends [(...args: infer U) => any]
    ? U
    : [T] extends [void] ? [] : [T];

export default class PluginInterface<TPlugin> {
    constructor(
        private plugins = [] as TPlugin[]
    ) { }

    /**
     * Call `event` on plugins
     */
    public async emit<K extends keyof TPlugin & string>(eventName: K, event: Arguments<TPlugin[K]>[0]) {
        for (let plugin of this.plugins) {
            if ((plugin as any)[eventName]) {
                await Promise.resolve((plugin as any)[eventName](event));
            }
        }
        return event;
    }

    /**
     * Add a plugin to the end of the list of plugins
     */
    public add<T extends TPlugin = TPlugin>(plugin: T) {
        if (!this.has(plugin)) {
            this.plugins.push(plugin);
        }
        return plugin;
    }

    /**
     * Is the specified plugin present in the list
     */
    public has(plugin: TPlugin) {
        return this.plugins.includes(plugin);
    }

    /**
     * Remove the specified plugin
     */
    public remove<T extends TPlugin = TPlugin>(plugin: T) {
        if (this.has(plugin)) {
            this.plugins.splice(this.plugins.indexOf(plugin));
        }
        return plugin;
    }

    /**
     * Remove all plugins
     */
    public clear() {
        this.plugins = [];
    }
}
