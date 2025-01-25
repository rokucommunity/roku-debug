import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rosgnodeevent.md
export function pushRoSGNodeEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$data',
        type: VariableType.Object,
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
        name: '$rosgnode',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getRoSGNode()`,
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
        value: '',
        children: []
    });
}
