import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifxmlelement.md
export function pushIfXMLElementVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$body',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetBody()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$attributes',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetAttributes()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$name',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetName()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$text',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetText()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$childElements',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetChildElements()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$childNodes',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetChildNodes()`,
        value: '',
        children: []
    });
}
