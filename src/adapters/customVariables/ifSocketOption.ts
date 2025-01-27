import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketoption.md
export function pushIfSocketOptionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$ttl',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTTL()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$reuseAddr',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetReuseAddr()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$oobInline',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetOOBInline()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sendBuf',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSendBuf()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$rcvBuf',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRcvBuf()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sendTimeout',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSendTimeout()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$receiveTimeout',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetReceiveTimeout()`,
        lazy: true,
        value: '',
        children: []
    });
}
