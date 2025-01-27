import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifdraw2d.md
export function pushIfDraw2DVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$width',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetWidth()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$height',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetHeight()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$alphaEnable',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAlphaEnable()`,
        lazy: true,
        value: '',
        children: []
    });
}
