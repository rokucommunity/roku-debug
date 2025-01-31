import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketcastoption.md
export function pushIfSocketCastOptionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$broadcast',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetBroadcast()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$multicastLoop',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMulticastLoop()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$multicastTTL',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMulticastTTL()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$id',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetID()`,
        value: '',
        children: []
    });
}
