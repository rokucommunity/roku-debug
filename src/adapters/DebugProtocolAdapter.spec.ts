
import { expect } from 'chai';
import { Debugger } from '../debugProtocol/Debugger';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import type { VariableInfo } from '../debugProtocol/responses';
import { VariableResponse } from '../debugProtocol/responses';
import { ERROR_CODES } from './../debugProtocol/Constants';
const sinon = createSandbox();

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;
    let socketDebugger: Debugger;
    beforeEach(() => {

        adapter = new DebugProtocolAdapter(null, null);
        socketDebugger = new Debugger(undefined);
        adapter['socketDebugger'] = socketDebugger;
    });

    describe('getVariable', () => {
        let response: VariableResponse;
        let variables: Partial<VariableInfo>[];

        beforeEach(() => {
            response = new VariableResponse(Buffer.alloc(5));
            response.errorCode = ERROR_CODES.OK;
            variables = [];
            sinon.stub(adapter as any, 'getStackFrameById').returns({});
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
                'person["name"]',
                'person["age"]'
            ]);
        });

    });
});
