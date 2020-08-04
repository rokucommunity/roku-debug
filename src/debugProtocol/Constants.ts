export const enum PROTOCOL_ERROR_CODES {
    NOT_TESTED,
    SUPPORTED,
    NOT_SUPPORTED
}

export const enum COMMANDS {
    STOP = 1,
    CONTINUE,
    THREADS,
    STACKTRACE,
    VARIABLES,
    STEP,
    ADD_BREAKPOINTS,
    LIST_BREAKPOINTS,
    REMOVE_BREAKPOINTS,
    EXIT_CHANNEL = 122
}

export const enum STEP_TYPE {
  STEP_TYPE_NONE,
  STEP_TYPE_LINE,
  STEP_TYPE_OUT,
  STEP_TYPE_OVER
}

//#region RESPONSE CONSTS
export const ERROR_CODES = {
    0: 'OK',
    1: 'OTHER_ERR',
    2: 'UNDEFINED_COMMAND',
    3: 'CANT_CONTINUE',
    4: 'NOT_STOPPED',
    5: 'INVALID_ARGS'
};

export const STOP_REASONS = {
    0: 'UNDEFINED',
    1: 'NOT_STOPPED',
    2: 'NORMAL_EXIT',
    3: 'STOP_STATEMENT',
    4: 'BREAK',
    5: 'RUNTIME_ERROR'
};

export const UPDATE_TYPES = {
    0: 'UNDEF',
    1: 'IO_PORT_OPENED',
    2: 'ALL_THREADS_STOPPED',
    3: 'THREAD_ATTACHED'
};

export const VARIABLE_FLAGS = {
    isChildKey: 0x01,
    isConst: 0x02,
    isContainer: 0x04,
    isNameHere: 0x08,
    isRefCounted: 0x10,
    isValueHere: 0x20
};

export const VARIABLE_TYPES = {
    1: 'AA',
    2: 'Array',
    3: 'Boolean',
    4: 'Double',
    5: 'Float',
    6: 'Function',
    7: 'Integer',
    8: 'Interface',
    9: 'Invalid',
    10: 'List',
    11: 'Long_Integer',
    12: 'Object',
    13: 'String',
    14: 'Subroutine',
    15: 'Subtyped_Object',
    16: 'Uninitialized',
    17: 'Unknown'
};
//#endregion
