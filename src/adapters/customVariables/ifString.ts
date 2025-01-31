import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifstring.md
export function pushIfStringVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$string',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetString()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$isEmpty',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsEmpty()`,
        value: '',
        children: []
    });
}
