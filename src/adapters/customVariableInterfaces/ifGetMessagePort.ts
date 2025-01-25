import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifgetmessageport.md
export function pushIfGetMessagePortVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$messageport',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMessagePort()`,
        evaluateNow: true,
        value: '',
        children: []
    });
}
