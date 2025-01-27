import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rouniversalcontrolevent.md
export function pushRoUniversalControlEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$int',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInt()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$key',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetKey()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$remoteid',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRemoteID()`,
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

    pushCustomVariableToContainer(container, {
        name: '$press',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsPress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$char',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChar()`,
        lazy: true,
        value: '',
        children: []
    });
}
