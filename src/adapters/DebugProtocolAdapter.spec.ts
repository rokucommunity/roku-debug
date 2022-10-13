
import { expect } from 'chai';
import { DebugProtocolClient } from '../debugProtocol/client/DebugProtocolClient';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import type { Variable } from '../debugProtocol/events/responses/VariablesResponse';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import { VariablesResponse } from '../debugProtocol/events/responses/VariablesResponse';
const sinon = createSandbox();

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;
    let socketDebugger: DebugProtocolClient;
    beforeEach(() => {

        adapter = new DebugProtocolAdapter(
            {
                host: '127.0.0.1'
            },
            undefined,
            undefined
        );
        socketDebugger = new DebugProtocolClient(undefined);
        adapter['socketDebugger'] = socketDebugger;
    });

    describe('getVariable', () => {
        let response: VariablesResponse;
        let variables: Partial<Variable>[];

        beforeEach(() => {
            response = VariablesResponse.fromJson({
                requestId: 3,
                variables: []
            });
            sinon.stub(adapter as any, 'getStackFrameById').returns({});
            sinon.stub(socketDebugger, 'getVariables').callsFake(() => {
                response.data.variables = variables as any;
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
            const vars = await adapter.getVariable('', 1);
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
                { isContainer: true, childCount: 2, variableType: VariableType.AA } as any,
                { name: 'name', isChildKey: true } as any,
                { name: 'age', isChildKey: true } as any
            );

            const vars = await adapter.getVariable('person', 1);
            expect(
                vars?.children.map(x => x.evaluateName)
            ).to.eql([
                'person["name"]',
                'person["age"]'
            ]);
        });

    });
});
