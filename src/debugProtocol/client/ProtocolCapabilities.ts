import * as semver from 'semver';

/**
 * Encapsulates the version-based capability checks for the BrightScript debug protocol.
 * Used by `DebugProtocolClient` for the live session (version set during the handshake),
 * and by `DebugProtocolAdapter` as a standalone fallback seeded from the device-info
 * `brightscript-debugger-version` when no client has connected yet.
 */
export class ProtocolCapabilities {
    constructor(public readonly protocolVersion: string) { }

    /**
     * Prior to protocol v3.1.0, the Roku device would regularly set the wrong thread as "active",
     * so this flag lets us know if we should use our better-than-nothing workaround
     */
    public get enableThreadHoppingWorkaround() {
        return semver.satisfies(this.protocolVersion, '<3.1.0');
    }

    /**
     * Starting in protocol v3.1.0, component library breakpoints must be added in the format
     * `lib:/<library_name>/<filepath>`, but prior they didn't require this.
     */
    public get enableComponentLibrarySpecificBreakpoints() {
        return semver.satisfies(this.protocolVersion, '>=3.1.0');
    }

    /**
     * Starting in protocol v3.1.0, breakpoints can support conditional expressions.
     */
    public get supportsConditionalBreakpoints() {
        return semver.satisfies(this.protocolVersion, '>=3.1.0');
    }

    /**
     * Starting in protocol v3.1.0, breakpoints can carry a hit count (ignoreCount).
     */
    public get supportsHitConditionalBreakpoints() {
        return semver.satisfies(this.protocolVersion, '>=3.1.0');
    }

    public get supportsBreakpointRegistrationWhileRunning() {
        return semver.satisfies(this.protocolVersion, '>=3.2.0');
    }

    public get supportsBreakpointVerification() {
        return semver.satisfies(this.protocolVersion, '>=3.2.0');
    }

    public get supportsVirtualVariables() {
        return semver.satisfies(this.protocolVersion, '>=3.3.0');
    }

    public get supportsExceptionBreakpoints() {
        return semver.satisfies(this.protocolVersion, '>=3.3.0');
    }

    /**
     * Due to casing issues with the variables request on older protocols, we first try the
     * request in the supplied case and retry in lower case on failure.
     */
    public get enableVariablesLowerCaseRetry() {
        return semver.satisfies(this.protocolVersion, '<3.1.0');
    }

    /**
     * The `execute` command was unreliable before protocol v3.0.0.
     */
    public get supportsExecuteCommand() {
        return semver.satisfies(this.protocolVersion, '>=3.0.0');
    }

    /**
     * The device emits compile-error update events starting in protocol v3.1.0.
     */
    public get supportsCompileErrorReporting() {
        return semver.satisfies(this.protocolVersion, '>=3.1.0');
    }
}
