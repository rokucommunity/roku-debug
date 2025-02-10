import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodefield.md
export function pushIfSGNodeFieldVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$fieldTypes',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.getFieldTypes()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$threadInfo',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.threadInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
