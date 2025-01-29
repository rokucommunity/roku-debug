import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketconnectionstatus.md
export function pushIfSocketConnectionStatusVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$eConnaborted',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.eConnAborted()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eConnrefused',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.eConnRefused()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eConnReset',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.eConnReset()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eIsConn',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.eIsConn()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eNotConn',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.eNotConn()`,
        value: '',
        children: []
    });
}
