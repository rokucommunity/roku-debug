import { expect } from 'chai';
import { ProtocolCapabilities } from './ProtocolCapabilities';

describe('ProtocolCapabilities', () => {
    describe('protocolVersion resolution', () => {
        it('uses the supplied protocol version when it is valid', () => {
            expect(new ProtocolCapabilities('3.2.0', '11.0.0').protocolVersion).to.equal('3.2.0');
        });

        it('resolves every OS range to its introduced protocol version', () => {
            const cases: Array<[string, string]> = [
                //>= 14.1 → 3.3.0
                ['14.1.0', '3.3.0'],
                ['14.5.0', '3.3.0'],
                ['15.0.0', '3.3.0'],
                ['99.99.99', '3.3.0'],
                //12.0 - 14.0 → 3.2.0
                ['12.0.0', '3.2.0'],
                ['12.5.7', '3.2.0'],
                ['13.0.0', '3.2.0'],
                ['14.0.99', '3.2.0'],
                //11.5 - 11.x → 3.1.0
                ['11.5.0', '3.1.0'],
                ['11.5.5', '3.1.0'],
                ['11.9.99', '3.1.0'],
                //11.0 - 11.4 → 3.0.0
                ['11.0.0', '3.0.0'],
                ['11.2.3', '3.0.0'],
                ['11.4.99', '3.0.0'],
                //9.3 - 10.x → 2.0.0
                ['9.3.0', '2.0.0'],
                ['9.4.0', '2.0.0'],
                ['10.0.0', '2.0.0'],
                ['10.5.0', '2.0.0'],
                ['10.99.99', '2.0.0'],
                //9.2 - 9.2.x → 1.0.1
                ['9.2.0', '1.0.1'],
                ['9.2.99', '1.0.1']
            ];
            for (const [osVersion, expected] of cases) {
                expect(new ProtocolCapabilities(undefined, osVersion).protocolVersion, `osVersion=${osVersion}`).to.equal(expected);
            }
        });

        it('derives the protocol version when protocol version is an empty string', () => {
            expect(new ProtocolCapabilities('', '14.1.0').protocolVersion).to.equal('3.3.0');
        });

        it('returns the original value when osVersion is missing and protocol version is invalid', () => {
            expect(new ProtocolCapabilities(undefined).protocolVersion).to.be.undefined;
            expect(new ProtocolCapabilities('').protocolVersion).to.equal('');
        });

        it('returns the original value when osVersion is too old to map', () => {
            expect(new ProtocolCapabilities(undefined, '9.1.0').protocolVersion).to.be.undefined;
        });

        it('coerces a non-strict os version string', () => {
            expect(new ProtocolCapabilities(undefined, '11.5').protocolVersion).to.equal('3.1.0');
            expect(new ProtocolCapabilities(undefined, '12').protocolVersion).to.equal('3.2.0');
        });
    });

    describe('capability flags', () => {
        it('reports capabilities based on the resolved protocol version', () => {
            const caps = new ProtocolCapabilities(undefined, '12.0.0');
            expect(caps.protocolVersion).to.equal('3.2.0');
            expect(caps.supportsBreakpointVerification).to.be.true;
            expect(caps.supportsVirtualVariables).to.be.false;
            expect(caps.enableThreadHoppingWorkaround).to.be.false;
        });

        describe('enableThreadHoppingWorkaround', () => {
            it('is true for protocol versions < 3.1.0', () => {
                expect(new ProtocolCapabilities('1.0.0').enableThreadHoppingWorkaround).to.be.true;
                expect(new ProtocolCapabilities('2.0.0').enableThreadHoppingWorkaround).to.be.true;
                expect(new ProtocolCapabilities('3.0.0').enableThreadHoppingWorkaround).to.be.true;
            });

            it('is false for protocol versions >= 3.1.0', () => {
                expect(new ProtocolCapabilities('3.1.0').enableThreadHoppingWorkaround).to.be.false;
                expect(new ProtocolCapabilities('3.2.0').enableThreadHoppingWorkaround).to.be.false;
                expect(new ProtocolCapabilities('3.5.0').enableThreadHoppingWorkaround).to.be.false;
            });
        });

        describe('enableComponentLibrarySpecificBreakpoints', () => {
            it('is false for protocol versions < 3.1.0', () => {
                expect(new ProtocolCapabilities('3.0.0').enableComponentLibrarySpecificBreakpoints).to.be.false;
            });

            it('is true for protocol versions >= 3.1.0', () => {
                expect(new ProtocolCapabilities('3.1.0').enableComponentLibrarySpecificBreakpoints).to.be.true;
                expect(new ProtocolCapabilities('3.2.0').enableComponentLibrarySpecificBreakpoints).to.be.true;
            });
        });

        describe('supportsConditionalBreakpoints', () => {
            it('is false for protocol versions < 3.1.0', () => {
                expect(new ProtocolCapabilities('3.0.0').supportsConditionalBreakpoints).to.be.false;
            });

            it('is true for protocol versions >= 3.1.0', () => {
                expect(new ProtocolCapabilities('3.1.0').supportsConditionalBreakpoints).to.be.true;
                expect(new ProtocolCapabilities('3.2.0').supportsConditionalBreakpoints).to.be.true;
            });
        });

        describe('supportsHitConditionalBreakpoints', () => {
            it('is false for protocol versions < 3.1.0', () => {
                expect(new ProtocolCapabilities('3.0.0').supportsHitConditionalBreakpoints).to.be.false;
            });

            it('is true for protocol versions >= 3.1.0', () => {
                expect(new ProtocolCapabilities('3.1.0').supportsHitConditionalBreakpoints).to.be.true;
                expect(new ProtocolCapabilities('3.2.0').supportsHitConditionalBreakpoints).to.be.true;
            });
        });

        describe('supportsBreakpointRegistrationWhileRunning', () => {
            it('is false for protocol versions < 3.2.0', () => {
                expect(new ProtocolCapabilities('3.1.0').supportsBreakpointRegistrationWhileRunning).to.be.false;
            });

            it('is true for protocol versions >= 3.2.0', () => {
                expect(new ProtocolCapabilities('3.2.0').supportsBreakpointRegistrationWhileRunning).to.be.true;
                expect(new ProtocolCapabilities('3.3.0').supportsBreakpointRegistrationWhileRunning).to.be.true;
            });
        });

        describe('supportsBreakpointVerification', () => {
            it('is false for protocol versions < 3.2.0', () => {
                expect(new ProtocolCapabilities('3.1.0').supportsBreakpointVerification).to.be.false;
            });

            it('is true for protocol versions >= 3.2.0', () => {
                expect(new ProtocolCapabilities('3.2.0').supportsBreakpointVerification).to.be.true;
                expect(new ProtocolCapabilities('3.3.0').supportsBreakpointVerification).to.be.true;
            });
        });

        describe('supportsVirtualVariables', () => {
            it('is false for protocol versions < 3.3.0', () => {
                expect(new ProtocolCapabilities('3.2.0').supportsVirtualVariables).to.be.false;
            });

            it('is true for protocol versions >= 3.3.0', () => {
                expect(new ProtocolCapabilities('3.3.0').supportsVirtualVariables).to.be.true;
                expect(new ProtocolCapabilities('3.4.0').supportsVirtualVariables).to.be.true;
            });
        });

        describe('supportsExceptionBreakpoints', () => {
            it('is false for protocol versions < 3.3.0', () => {
                expect(new ProtocolCapabilities('3.2.0').supportsExceptionBreakpoints).to.be.false;
            });

            it('is true for protocol versions >= 3.3.0', () => {
                expect(new ProtocolCapabilities('3.3.0').supportsExceptionBreakpoints).to.be.true;
                expect(new ProtocolCapabilities('3.4.0').supportsExceptionBreakpoints).to.be.true;
            });
        });

        describe('enableVariablesLowerCaseRetry', () => {
            it('is true for protocol versions < 3.1.0', () => {
                expect(new ProtocolCapabilities('1.0.0').enableVariablesLowerCaseRetry).to.be.true;
                expect(new ProtocolCapabilities('3.0.0').enableVariablesLowerCaseRetry).to.be.true;
            });

            it('is false for protocol versions >= 3.1.0', () => {
                expect(new ProtocolCapabilities('3.1.0').enableVariablesLowerCaseRetry).to.be.false;
                expect(new ProtocolCapabilities('3.2.0').enableVariablesLowerCaseRetry).to.be.false;
            });
        });

        describe('supportsExecuteCommand', () => {
            it('is false for protocol versions < 3.0.0', () => {
                expect(new ProtocolCapabilities('1.0.0').supportsExecuteCommand).to.be.false;
                expect(new ProtocolCapabilities('2.0.0').supportsExecuteCommand).to.be.false;
            });

            it('is true for protocol versions >= 3.0.0', () => {
                expect(new ProtocolCapabilities('3.0.0').supportsExecuteCommand).to.be.true;
                expect(new ProtocolCapabilities('3.1.0').supportsExecuteCommand).to.be.true;
            });
        });

        describe('supportsCompileErrorReporting', () => {
            it('is false for protocol versions < 3.1.0', () => {
                expect(new ProtocolCapabilities('3.0.0').supportsCompileErrorReporting).to.be.false;
            });

            it('is true for protocol versions >= 3.1.0', () => {
                expect(new ProtocolCapabilities('3.1.0').supportsCompileErrorReporting).to.be.true;
                expect(new ProtocolCapabilities('3.2.0').supportsCompileErrorReporting).to.be.true;
            });
        });

        describe('supportsThreadIdentityInfo', () => {
            it('is false for protocol versions < 3.5.0', () => {
                expect(new ProtocolCapabilities('3.0.0').supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities('3.1.0').supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities('3.2.0').supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities('3.3.0').supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities('3.4.0').supportsThreadIdentityInfo).to.be.false;
            });

            it('is true for protocol versions >= 3.5.0', () => {
                expect(new ProtocolCapabilities('3.5.0').supportsThreadIdentityInfo).to.be.true;
                expect(new ProtocolCapabilities('3.6.0').supportsThreadIdentityInfo).to.be.true;
                expect(new ProtocolCapabilities('4.0.0').supportsThreadIdentityInfo).to.be.true;
            });

            it('is false just below the 3.5.0 boundary', () => {
                expect(new ProtocolCapabilities('3.4.99').supportsThreadIdentityInfo).to.be.false;
            });

            it('is false when the protocol version is unknown', () => {
                //unresolved/invalid versions should never opt into a newer capability
                expect(new ProtocolCapabilities(undefined).supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities('').supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities('not-a-version').supportsThreadIdentityInfo).to.be.false;
            });

            it('is false for every OS-derived version, since the OS table tops out at protocol 3.3.0', () => {
                //no Roku OS currently maps to protocol >=3.5.0, so identity info can only be enabled
                //via an explicit protocol version reported during the handshake
                expect(new ProtocolCapabilities(undefined, '14.1.0').supportsThreadIdentityInfo).to.be.false;
                expect(new ProtocolCapabilities(undefined, '99.99.99').supportsThreadIdentityInfo).to.be.false;
            });

            it('uses the explicit protocol version even when an older OS is also supplied', () => {
                //an explicit, valid protocol version always wins over OS derivation
                expect(new ProtocolCapabilities('3.5.0', '11.0.0').supportsThreadIdentityInfo).to.be.true;
            });
        });
    });
});
