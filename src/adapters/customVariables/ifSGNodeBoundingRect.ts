import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodeboundingrect.md
export function pushIfSGNodeBoundingRectVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$boundingRect',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.boundingRect()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$localBoundingRect',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.localBoundingRect()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sceneBoundingRect',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.sceneBoundingRect()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
