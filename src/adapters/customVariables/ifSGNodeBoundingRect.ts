import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodeboundingrect.md
export function pushIfSGNodeBoundingRectVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$boundingrect',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.boundingRect()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$localboundingrect',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.localBoundingRect()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sceneboundingrect',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.sceneBoundingRect()`,
        value: '',
        children: []
    });
}
