import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rouniversalcontrolevent.md
export function pushRoUniversalControlEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$int',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetInt()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$key',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetKey()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$remoteID',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRemoteID()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$id',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetID()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isPress',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsPress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$char',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetChar()`,
        value: '',
        children: []
    });
}
