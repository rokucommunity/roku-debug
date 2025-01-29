import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketoption.md
export function pushIfSocketOptionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$ttl',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTTL()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$reuseAddr',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetReuseAddr()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$oobInline',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetOOBInline()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sendBuf',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetSendBuf()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$rcvBuf',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRcvBuf()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sendTimeout',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetSendTimeout()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$receiveTimeout',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetReceiveTimeout()`,
        value: '',
        children: []
    });
}
