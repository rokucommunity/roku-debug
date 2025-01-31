import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iftostr.md
export function pushIfToStrVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$str',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.ToStr()`,
        value: '',
        children: []
    });
}
