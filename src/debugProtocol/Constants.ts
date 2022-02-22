export enum PROTOCOL_ERROR_CODES {
    NOT_TESTED = 0,
    SUPPORTED = 1,
    NOT_SUPPORTED = 2
}

export enum COMMANDS {
    STOP = 1,
    CONTINUE = 2,
    THREADS = 3,
    STACKTRACE = 4,
    VARIABLES = 5,
    STEP = 6, // Since protocol 1.1
    ADD_BREAKPOINTS = 7, // since protocol 1.2
    LIST_BREAKPOINTS = 8, // since protocol 1.2
    REMOVE_BREAKPOINTS = 9, // since protocol 1.2
    EXECUTE = 10, // since protocol 2.1
    EXIT_CHANNEL = 122
}

export enum STEP_TYPE {
    STEP_TYPE_NONE = 0,
    STEP_TYPE_LINE = 1,
    STEP_TYPE_OUT = 2,
    STEP_TYPE_OVER = 3
}

//#region RESPONSE CONSTS
export enum ERROR_CODES {
    OK = 0,
    OTHER_ERR = 1,
    UNDEFINED_COMMAND = 2,
    CANT_CONTINUE = 3,
    NOT_STOPPED = 4,
    INVALID_ARGS = 5
}

export enum STOP_REASONS {
    UNDEFINED = 0,
    NOT_STOPPED = 1,
    NORMAL_EXIT = 2,
    STOP_STATEMENT = 3,
    BREAK = 4,
    RUNTIME_ERROR = 5
}

export enum UPDATE_TYPES {
    UNDEF = 0,
    IO_PORT_OPENED = 1,
    ALL_THREADS_STOPPED = 2,
    THREAD_ATTACHED = 3
}

export enum VARIABLE_FLAGS {
    isChildKey = 0x01,
    isConst = 0x02,
    isContainer = 0x04,
    isNameHere = 0x08,
    isRefCounted = 0x10,
    isValueHere = 0x20
}

export enum VARIABLE_TYPES {
    AA = 1,
    Array = 2,
    Boolean = 3,
    Double = 4,
    Float = 5,
    Function = 6,
    Integer = 7,
    Interface = 8,
    Invalid = 9,
    List = 10,
    Long_Integer = 11,
    Object = 12,
    String = 13,
    Subroutine = 14,
    Subtyped_Object = 15,
    Uninitialized = 16,
    Unknown = 17
}
//#endregion

export function getUpdateType(value: number): UPDATE_TYPES {
    switch (value) {
        case UPDATE_TYPES.ALL_THREADS_STOPPED:
            return UPDATE_TYPES.ALL_THREADS_STOPPED;
        case UPDATE_TYPES.IO_PORT_OPENED:
            return UPDATE_TYPES.IO_PORT_OPENED;
        case UPDATE_TYPES.THREAD_ATTACHED:
            return UPDATE_TYPES.THREAD_ATTACHED;
        case UPDATE_TYPES.UNDEF:
            return UPDATE_TYPES.UNDEF;
        default:
            return UPDATE_TYPES.UNDEF;
    }
}
