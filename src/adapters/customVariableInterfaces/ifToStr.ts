import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iftostr.md
export function pushIfToStrVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$str',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToStr()`,
        lazy: true,
        value: '',
        children: []
    });
}
