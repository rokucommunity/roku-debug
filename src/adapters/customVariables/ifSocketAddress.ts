import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketaddress.md
export function pushIfSocketAddressVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$address',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$hostName',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetHostName()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$port',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetPort()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$isAddressValid',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsAddressValid()`,
        value: '',
        children: []
    });
}
