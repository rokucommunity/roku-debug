import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketcastoption.md
export function pushIfSocketCastOptionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$broadcast',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetBroadcast()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$multicastLoop',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMulticastLoop()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$multicastTTL',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMulticastTTL()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$id',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetID()`,
        lazy: true,
        value: '',
        children: []
    });
}
