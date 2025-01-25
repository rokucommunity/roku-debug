import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifregion.md
export function pushIfRegionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$bitmap',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetBitmap()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$x',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetX()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$y',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetY()`,
        lazy: true,
        value: '',
        children: []
    });

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
        name: '$wrap',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetWrap()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$time',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTime()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$pretranslationx',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPretranslationX()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$pretranslationy',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPretranslationY()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$scalemode',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetScaleMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$collisiontype',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCollisionType()`,
        lazy: true,
        value: '',
        children: []
    });
}
