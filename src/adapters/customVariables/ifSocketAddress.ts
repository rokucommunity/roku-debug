import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketaddress.md
export function pushIfSocketAddressVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$address',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAddress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$hostname',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetHostName()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$port',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPort()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$addressvalid',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsAddressValid()`,
        lazy: true,
        value: '',
        children: []
    });
}
