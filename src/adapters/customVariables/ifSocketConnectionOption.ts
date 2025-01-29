import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketconnectionoption.md
export function pushIfSocketConnectionOptionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$keepAlive',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetKeepAlive()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$linger',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetLinger()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$maxSeg',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMaxSeg()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$noDelay',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetNoDelay()`,
        value: '',
        children: []
    });
}
