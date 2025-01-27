import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifmessageport.md
export function pushIfMessagePortVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$peekMessage',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.PeekMessage()`,
        lazy: true,
        value: '',
        children: []
    });
}
