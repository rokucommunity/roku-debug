import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodedict.md
export function pushIfSGNodeDictVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$subtype',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.subtype()`,
        lazy: true,
        value: '',
        children: []
    });
}
