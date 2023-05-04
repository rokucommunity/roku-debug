
import { expect } from 'chai';
import { Debugger } from '../debugProtocol/Debugger';
import { DebugProtocolAdapter } from './DebugProtocolAdapter';
import { createSandbox } from 'sinon';
import type { VariableInfo } from '../debugProtocol/responses';
import { VariableResponse } from '../debugProtocol/responses';
import { ERROR_CODES } from './../debugProtocol/Constants';
import { RendezvousTracker } from '../RendezvousTracker';
const sinon = createSandbox();

describe('DebugProtocolAdapter', () => {
    let adapter: DebugProtocolAdapter;
    let socketDebugger: Debugger;
    let deviceInfo = {
        'software-version': '11.5.0',
        'host': '192.168.1.5',
        'remotePort': 8060
    };
    let rendezvousTracker = new RendezvousTracker(deviceInfo);
    beforeEach(() => {

        adapter = new DebugProtocolAdapter(
            {
                host: '127.0.0.1'
            },
            undefined,
            undefined,
            rendezvousTracker
        );
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
