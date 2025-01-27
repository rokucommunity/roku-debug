import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifxmlelement.md
export function pushIfXMLElementVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$body',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetBody()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$attributes',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAttributes()`,
        lazy: true,
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
        name: '$childElements',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChildElements()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$childNodes',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChildNodes()`,
        lazy: true,
        value: '',
        children: []
    });
}
