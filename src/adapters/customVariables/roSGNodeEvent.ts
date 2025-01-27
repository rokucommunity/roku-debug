import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rosgnodeevent.md
export function pushRoSGNodeEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$data',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.getData()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$field',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getField()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$roSGNode',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.getRoSGNode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$node',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getNode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$info',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
