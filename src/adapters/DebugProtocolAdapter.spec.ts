
import { assert, expect } from 'chai';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;

    beforeEach(() => {
        adapter = new DebugProtocolAdapter(null, null);
    });

    describe('getVariablePath', () => {
        it('correctly handles different types of expressions', () => {
            expect(adapter.getVariablePath(`m_that["this -that.thing"]  .other[9]`)).to.eql(['m_that', 'this -that.thing', 'other', '9']);
            expect(adapter.getVariablePath(`a`)).to.eql(['a']);
            expect(adapter.getVariablePath(`boy5`)).to.eql(['boy5']);
            expect(adapter.getVariablePath(`super_man$`)).to.eql(['super_man$']);
            expect(adapter.getVariablePath(`_super_man$`)).to.eql(['_super_man$']);
            expect(adapter.getVariablePath(`m_that["this "-that.thing"]  .other[9]`)).to.eql(['m_that', 'this "-that.thing', 'other', '9']);
            expect(adapter.getVariablePath(`m_that["this \"-that.thing"]  .other[9]`)).to.eql(['m_that', 'this \"-that.thing', 'other', '9']);
            expect(adapter.getVariablePath(`a["something with a quote"].c`)).to.eql(['a', 'something with a quote', 'c']);
            expect(adapter.getVariablePath(`m.global.initialInputEvent`)).to.eql(['m', 'global', 'initialInputEvent']);
            expect(adapter.getVariablePath(`m.global.initialInputEvent.0`)).to.eql(['m', 'global', 'initialInputEvent', '0']);
            expect(adapter.getVariablePath(`m.global.initialInputEvent.0[123]`)).to.eql(['m', 'global', 'initialInputEvent', '0', '123']);
            expect(adapter.getVariablePath(`m.global.initialInputEvent.0[123]["this \"-that.thing"]`)).to.eql(['m', 'global', 'initialInputEvent', '0', '123', 'this \"-that.thing']);
            expect(adapter.getVariablePath(`m.global["something with a quote"]initialInputEvent.0[123]["this \"-that.thing"]`)).to.eql(['m', 'global', 'something with a quote', 'initialInputEvent', '0', '123', 'this \"-that.thing']);
            expect(adapter.getVariablePath(`m.["that"]`)).to.eql(['m', 'that']);
        });
    });
});
