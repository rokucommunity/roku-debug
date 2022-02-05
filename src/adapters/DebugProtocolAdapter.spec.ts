
import { assert, expect } from 'chai';
import { Debugger } from '../debugProtocol/Debugger';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import type { VariableInfo } from '../debugProtocol/responses';
import { VariableResponse } from '../debugProtocol/responses';
import { ERROR_CODES } from '..';
const sinon = createSandbox();

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;
    let socketDebugger: Debugger;
    beforeEach(() => {

        adapter = new DebugProtocolAdapter(null, null);
        socketDebugger = new Debugger(undefined);
        adapter['socketDebugger'] = socketDebugger;
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

    describe('getVariable', () => {
        let response: VariableResponse;
        let variables: Partial<VariableInfo>[];

        beforeEach(() => {
            response = new VariableResponse(Buffer.alloc(5));
            response.errorCode = ERROR_CODES.OK;
            variables = [];
            sinon.stub(adapter as any, 'getStackTraceById').returns({});
            sinon.stub(socketDebugger, 'getVariables').callsFake(() => {
                response.variables = variables as any;
                return Promise.resolve(response);
            });
            socketDebugger['stopped'] = true;
        });

        it('works for local vars', async () => {
            variables.push(
                { name: 'm' },
                { name: 'person' },
                { name: 'age' }
            );
            const vars = await adapter.getVariable('', 1, true);
            expect(
                vars?.children.map(x => x.evaluateName)
            ).to.eql([
                'm',
                'person',
                'age'
            ]);
        });

        it('works for object properties', async () => {
            variables.push(
                { isContainer: true, elementCount: 2, isChildKey: false, variableType: 'AA' },
                { name: 'name', isChildKey: true },
                { name: 'age', isChildKey: true }
            );

            const vars = await adapter.getVariable('person', 1, true);
            expect(
                vars?.children.map(x => x.evaluateName)
            ).to.eql([
                'person.name',
                'person.age'
            ]);
        });

    });
});
