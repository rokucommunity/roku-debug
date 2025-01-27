import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifgetmessageport.md
export function pushIfGetMessagePortVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$messagePort',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMessagePort()`,
        lazy: true,
        value: '',
        children: []
    });
}
