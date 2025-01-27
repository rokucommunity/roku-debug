import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iflist.md
export function pushIfListVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$tail',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTail()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$head',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetHead()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$count',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.Count()`,
        lazy: true,
        value: '',
        children: []
    });
}
