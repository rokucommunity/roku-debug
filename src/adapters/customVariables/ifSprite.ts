import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsprite.md
export function pushIfSpriteVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
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
        name: '$z',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetZ()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$drawableFlag',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDrawableFlag()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$memberFlags',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMemberFlags()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$collidableFlags',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCollidableFlags()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$region',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRegion()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$data',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetData()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$collision',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.CheckCollision()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$multipleCollisions',
        type: VariableType.Array,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.CheckMultipleCollisions()`,
        value: '',
        children: []
    });
}
