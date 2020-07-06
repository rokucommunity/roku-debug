
import { assert, expect } from 'chai';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;

    beforeEach(() => {
        adapter = new DebugProtocolAdapter(null, null);
    });

    describe('getVariablePath', () => {
        it('correctly handles different types of expressions', () => {
            let expressions = [
                [[`m_that["this -that.thing"]  .other[9]`], ['m_that', 'this -that.thing', 'other', '9']],
                [[`a`], ['a']],
                [[`boy5`], ['boy5']],
                [[`super_man$`], ['super_man$']],
                [[`_super_man$`], ['_super_man$']],
                [[`m_that["this "-that.thing"]  .other[9]`], ['m_that', 'this "-that.thing', 'other', '9']],
                [[`m_that["this \"-that.thing"]  .other[9]`], ['m_that', 'this \"-that.thing', 'other', '9']],
                [[`a["something with a quote"].c`], ['a', 'something with a quote', 'c']],
                [[`m.global.initialInputEvent`], ['m', 'global', 'initialInputEvent']],
                [[`m.global.initialInputEvent.0`], ['m', 'global', 'initialInputEvent', '0']],
                [[`m.global.initialInputEvent.0[123]`], ['m', 'global', 'initialInputEvent', '0', '123']],
                [[`m.global.initialInputEvent.0[123]["this \"-that.thing"]`], ['m', 'global', 'initialInputEvent', '0', '123', 'this \"-that.thing']],
                [[`m.global["something with a quote"]initialInputEvent.0[123]["this \"-that.thing"]`], ['m', 'global', 'something with a quote', 'initialInputEvent', '0', '123', 'this \"-that.thing']],
                [[`m.["that"]`], ['m', 'that']]
            ];

            expressions.forEach(expression => {
                assert.deepEqual(adapter.getVariablePath(expression[0][0]), expression[1]);
            });
        });
    });
});
