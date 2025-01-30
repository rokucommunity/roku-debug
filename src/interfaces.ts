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
    host: string;
    brightScriptConsolePort?: number;
    remotePort?: number;
    /**
     * If true, the application being debugged will stop on the first line of the program.
     */
    stopOnEntry?: boolean;
    autoResolveVirtualVariables: boolean;
}
