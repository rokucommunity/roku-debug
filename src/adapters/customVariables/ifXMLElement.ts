import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifxmlelement.md
export function pushIfXMLElementVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$body',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetBody()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$attributes',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetAttributes()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$name',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetName()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$text',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetText()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$childElements',
        type: VariableType.List,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetChildElements()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$childNodes',
        type: VariableType.List,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetChildNodes()`,
        value: '',
        children: []
    });
}
