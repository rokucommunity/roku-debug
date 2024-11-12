export enum PROTOCOL_ERROR_CODES {
    NOT_TESTED = 0,
    SUPPORTED = 1,
    NOT_SUPPORTED = 2
}

/**
 * The name of commands that can be sent from the client to the server. Think of these like "requests".
 */
export enum Command {
    /**
     * Stop all threads in application. Enter into debugger.
     *
     * Individual threads can not be stopped/started.
     */
    Stop = 'Stop',
    /**
     * Exit from debugger and continue execution of all threads.
     */
    Continue = 'Continue',
    /**
     * Application threads info
     */
    Threads = 'Threads',
    /**
     * Get the stack trace of a specific thread.
     */
    StackTrace = 'StackTrace',
    /**
     * Listing of variables accessible from selected thread and stack frame.
     */
    Variables = 'Variables',
    /**
     * Execute one step on a specified thread.
     *
     */
    Step = 'Step',
    /**
     * Add a dynamic breakpoint.
     *
     * @since protocol 2.0.0 (Roku OS 9.3)
     */
    AddBreakpoints = 'AddBreakpoints',
    /**
     * Lists existing dynamic and conditional breakpoints and their status.
     *
     * @since protocol 2.0.0 (Roku OS 9.3)
     */
    ListBreakpoints = 'ListBreakpoints',
    /**
     * Removes dynamic breakpoints.
     *
     * @since protocol 2.0.0 (Roku OS 9.3)
     */
    RemoveBreakpoints = 'RemoveBreakpoints',
    /**
     * Executes code in a specific stack frame.
     *
     * @since protocol 2.1 (Roku OS 10.5)
     */
    Execute = 'Execute',
    /**
     * Adds a conditional breakpoint.
     *
     * @since protocol 3.1.0 (Roku OS 11.5)
     */
    AddConditionalBreakpoints = 'AddConditionalBreakpoints',
    /**
     * Adds a exception breakpoint.
     *
     * @since protocol TBD
     */
    SetExceptionsBreakpoints = 'SetExceptionsBreakpoints',
    /**
     *
     */
    ExitChannel = 'ExitChannel'
}
/**
 * Only used for serializing/deserializing over the debug protocol. Use `Command` in your code.
 */
export enum CommandCode {
    Stop = 1,
    Continue = 2,
    Threads = 3,
    StackTrace = 4,
    Variables = 5,
    Step = 6,
    AddBreakpoints = 7,
    ListBreakpoints = 8,
    RemoveBreakpoints = 9,
    Execute = 10,
    AddConditionalBreakpoints = 11,
    SetExceptionsBreakpoints = 12,
    ExitChannel = 122
}

/**
 * Contains an a StepType enum, indicating the type of step action to be executed.
 */
export enum StepType {
    None = 'None',
    Line = 'Line',
    Out = 'Out',
    Over = 'Over'
}
/**
 * Only used for serializing/deserializing over the debug protocol. Use `StepType` in your code.
 */
export enum StepTypeCode {
    None = 0,
    Line = 1,
    Out = 2,
    Over = 3
}

export enum ErrorCode {
    OK = 0,
    OTHER_ERR = 1,
    UNDEFINED_COMMAND = 2,
    CANT_CONTINUE = 3,
    NOT_STOPPED = 4,
    INVALID_ARGS = 5,
    THREAD_DETACHED = 6,
    EXECUTION_TIMEOUT = 7
}

export enum ErrorFlags {
    INVALID_VALUE_IN_PATH = 0x0001,
    MISSING_KEY_IN_PATH = 0x0002
}

export enum StopReason {
    /**
     * Uninitialized stopReason.
     */
    Undefined = 'Undefined',
    /**
     * Thread is running.
     */
    NotStopped = 'NotStopped',
    /**
     * Thread exited.
     */
    NormalExit = 'NormalExit',
    /**
     * Stop statement executed.
     */
    StopStatement = 'StopStatement',
    /**
     * Another thread in the group encountered an error, this thread completed a step operation, or other reason outside this thread.
     */
    Break = 'Break',
    /**
     * Thread stopped because of an error during execution.
     */
    RuntimeError = 'RuntimeError'
}
/**
 * Only used for serializing/deserializing over the debug protocol. Use `StopReason` in your code.
 */
export enum StopReasonCode {
    Undefined = 0,
    NotStopped = 1,
    NormalExit = 2,
    StopStatement = 3,
    Break = 4,
    RuntimeError = 5
}

/**
 * Human-readable UpdateType values. To get the codes, use the `UpdateTypeCode` enum
 */
export enum UpdateType {
    Undefined = 'Undefined',
    /**
     * The remote debugging client should connect to the port included in the data field to retrieve the running script's output. Only reads are allowed on the I/O connection.
     */
    IOPortOpened = 'IOPortOpened',
    /**
     * All threads are stopped and an ALL_THREADS_STOPPED message is sent to the debugging client.
     *
     * The data field includes information on why the threads were stopped.
     */
    AllThreadsStopped = 'AllThreadsStopped',
    /**
     * A new thread attempts to execute a script when all threads have already been stopped. The new thread is immediately stopped and is "attached" to the
     * debugger so that the debugger can inspect the thread, its stack frames, and local variables.
     *
     * Additionally, when a thread executes a step operation, that thread detaches from the debugger temporarily,
     * and a THREAD_ATTACHED message is sent to the debugging client when the thread has completed its step operation and has re-attached to the debugger.
     *
     * The data field includes information on why the threads were stopped
     */
    ThreadAttached = 'ThreadAttached',
    /**
     * A compilation or runtime error occurred when evaluating the cond_expr of a conditional breakpoint
     * @since protocol 3.1
     */
    BreakpointError = 'BreakpointError',
    /**
     * A compilation error occurred
     * @since protocol 3.1
     */
    CompileError = 'CompileError',
    /**
     * Breakpoints were successfully verified
     * @since protocol 3.2
     */
    BreakpointVerified = 'BreakpointVerified',
    /**
     * An unrecoverable error has occurred on the protocol stream. As a result, the debug target is terminated.
     * @since Roku OS 12.0
     */
    ProtocolError = 'ProtocolError',
    /**
     * ExceptionBreakpointError updates will be sent for compile and runtime errors for exception breakpoint conditions.
     * These updates will be sent every time the condition fails to compile/run while throwing an exception.
     * @since protocol 3.3 (OS 14.1.4 or greater)
     */
    ExceptionBreakpointError = 'ExceptionBreakpointError'
}
/**
 * The integer values for `UPDATE_TYPE`. Only used for serializing/deserializing over the debug protocol. Use `UpdateType` in your code.
 */
export enum UpdateTypeCode {
    Undefined = 0,
    IOPortOpened = 1,
    AllThreadsStopped = 2,
    ThreadAttached = 3,
    BreakpointError = 4,
    CompileError = 5,
    /**
     * Breakpoints were successfully verified
     * @since protocol 3.2
     */
    BreakpointVerified = 6,
    /**
     * An unrecoverable error has occurred on the protocol stream. As a result, the debug target is terminated.
     */
    ProtocolError = 7,
    /**
     * ExceptionBreakpointError updates will be sent for compile and runtime errors for exception breakpoint conditions.
     * These updates will be sent every time the condition fails to compile/run while throwing an exception.
     * @since protocol 3.2
     */
    ExceptionBreakpointError = 8
}
