import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifstringops.md
export function pushIfStringOpsVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$len',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.Len()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$trim',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.Trim()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$int',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToInt()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$float',
        type: VariableType.Float,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToFloat()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$entityEncode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetEntityEncode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$escape',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.Escape()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$unescape',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.Unescape()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$encodeUri',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.EncodeUri()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$decodeUri',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.DecodeUri()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$encodeUriComponent',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.EncodeUriComponent()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$decodeUriComponent',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.DecodeUriComponent()`,
        lazy: true,
        value: '',
        children: []
    });
}
