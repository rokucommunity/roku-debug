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
