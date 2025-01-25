import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifxmlelement.md
export function pushIfXMLElementVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$body',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetBody()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$attributes',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAttributes()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$name',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetName()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$text',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetText()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$childelements',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChildElements()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$childnodes',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChildNodes()`,
        value: '',
        children: []
    });
}
