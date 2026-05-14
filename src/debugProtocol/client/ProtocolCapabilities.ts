import * as semver from 'semver';

/**
 * Encapsulates the version-based capability checks for the BrightScript debug protocol.
 * Used by `DebugProtocolClient` for the live session (version set during the handshake),
 * and by `DebugProtocolAdapter` as a standalone fallback seeded from the device-info
 * `brightscript-debugger-version` when no client has connected yet.
 */
export class ProtocolCapabilities {
    constructor(protocolVersion: string | undefined, osVersion?: string) {
        this.protocolVersion = ProtocolCapabilities.resolveProtocolVersion(protocolVersion, osVersion);
    }

    public readonly protocolVersion: string;

    /**
     * Roku OS versions that introduced each debug protocol version, ordered newest-first so
     * we can pick the highest protocol whose OS floor the device meets.
     */
    private static readonly osToProtocolVersions: ReadonlyArray<{ os: string; protocol: string }> = [
        { os: '14.1.0', protocol: '3.3.0' },
        { os: '12.0.0', protocol: '3.2.0' },
        { os: '11.5.0', protocol: '3.1.0' },
        { os: '11.0.0', protocol: '3.0.0' },
        { os: '9.3.0', protocol: '2.0.0' },
        { os: '9.2.0', protocol: '1.0.1' }
    ];

    /**
     * Some Roku firmware versions support the debug protocol but omit `brightscript-debugger-version`
     * from device-info, so fall back to deriving the protocol version from the OS version when the
     * caller didn't get one from the device.
     */
    private static resolveProtocolVersion(protocolVersion: string | undefined, osVersion: string | undefined): string {
        if (semver.valid(protocolVersion)) {
            return protocolVersion;
        }
        const coercedOs = osVersion ? semver.coerce(osVersion) : null;
        if (!coercedOs) {
            return protocolVersion;
        }
        for (const entry of ProtocolCapabilities.osToProtocolVersions) {
            if (semver.gte(coercedOs, entry.os)) {
                return entry.protocol;
            }
        }
        return protocolVersion;
    }

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
