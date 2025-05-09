import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifdraw2d.md
export function pushIfDraw2DVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$width',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetWidth()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$height',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetHeight()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$alphaEnable',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetAlphaEnable()`,
        value: '',
        children: []
    });
}
