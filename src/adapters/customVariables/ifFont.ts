import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffont.md
export function pushIfFontVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$oneLineHeight',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetOneLineHeight()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ascent',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAscent()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$descent',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDescent()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$maxAdvance',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMaxAdvance()`,
        lazy: true,
        value: '',
        children: []
    });
}
