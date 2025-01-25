import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifregistrysection.md
export function pushIfRegistrySectionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$keyList',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetKeyList()`,
        value: '',
        children: []
    });
}
