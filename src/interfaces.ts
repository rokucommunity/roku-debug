import type { DeviceOption } from 'roku-deploy';

export enum HighLevelType {
    primative = 'primative',
    array = 'array',
    function = 'function',
    object = 'object',
    uninitialized = 'uninitialized',
    /**
     * Our code was unable to determine the high level type
     */
    unknown = 'unknown'
}

export interface RokuAdapterEvaluateResponse {
    type: 'message' | 'error';
    message: string;
}

export interface AdapterOptions {
    /**
     * The host or ip address of the target device. Deprecated in favor of `device`, which also
     * addresses devices that have no host (like a Roku Cloud Emulator device); when `device` is
     * absent, a local device config is built from this field.
     */
    host?: string;
    /**
     * The roku-deploy device config for the target device. This is the canonical way to address the
     * device; when omitted, a local device config is built from the deprecated `host` field.
     */
    device?: DeviceOption;
    brightScriptConsolePort?: number;
    remotePort?: number;
    /**
     * If true, the application being debugged will stop on the first line of the program.
     */
    stopOnEntry?: boolean;
    autoResolveVirtualVariables?: boolean;
}

export interface Disposable {
    /**
     * Dispose this object.
     */
    dispose(): void;
}
export type DisposableLike = Disposable | (() => any);

export type PickMatching<T, V> =
    { [K in keyof T as T[K] extends V ? K : never]: T[K] };
// eslint-disable-next-line @typescript-eslint/ban-types
export type ExtractMethods<T> = PickMatching<T, Function>;

export type MaybePromise<T> = T | Promise<T>;
