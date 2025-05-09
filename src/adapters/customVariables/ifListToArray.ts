import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iflisttoarray.md
export function pushIfListToArrayVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$array',
        type: VariableType.Array,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.ToArray()`,
        value: '',
        children: []
    });
}
