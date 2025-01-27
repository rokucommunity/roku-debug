import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketconnectionstatus.md
export function pushIfSocketConnectionStatusVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$eConnaborted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eConnAborted()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eConnrefused',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eConnRefused()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eConnReset',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eConnReset()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eIsConn',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eIsConn()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eNotConn',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eNotConn()`,
        lazy: true,
        value: '',
        children: []
    });
}
