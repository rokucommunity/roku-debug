import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifinput.md
export function pushIfInputVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$messagePort',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMessagePort()`,
        value: '',
        children: []
    });
}
