import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffont.md
export function pushIfFontVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$oneLineHeight',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetOneLineHeight()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$ascent',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetAscent()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$descent',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDescent()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$maxAdvance',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMaxAdvance()`,
        value: '',
        children: []
    });
}
