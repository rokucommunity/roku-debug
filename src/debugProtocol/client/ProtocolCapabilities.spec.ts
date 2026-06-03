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
    });
});
