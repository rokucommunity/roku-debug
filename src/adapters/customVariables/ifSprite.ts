import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsprite.md
export function pushIfSpriteVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
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
        name: '$z',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetZ()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$drawableflag',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDrawableFlag()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$memberflags',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMemberFlags()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$collidableflags',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCollidableFlags()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$region',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRegion()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$data',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetData()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$collision',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.CheckCollision()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$multiplecollisions',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.CheckMultipleCollisions()`,
        value: '',
        children: []
    });
}
