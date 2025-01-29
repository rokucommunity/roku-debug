import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifurltransfer.md
export function pushIfUrlTransferVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$url',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.getUrl()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$userAgent',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetUserAgent()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$failureReason',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetFailureReason()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$request',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRequest()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$identity',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetIdentity()`,
        value: '',
        children: []
    });
}
