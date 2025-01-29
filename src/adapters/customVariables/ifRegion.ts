import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifregion.md
export function pushIfRegionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$bitmap',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetBitmap()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$x',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetX()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$y',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetY()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$width',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetWidth()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$height',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetHeight()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$wrap',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetWrap()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$time',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTime()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$pretranslationX',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetPretranslationX()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$pretranslationY',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetPretranslationY()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$scaleMode',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetScaleMode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$collisionType',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCollisionType()`,
        value: '',
        children: []
    });
}
