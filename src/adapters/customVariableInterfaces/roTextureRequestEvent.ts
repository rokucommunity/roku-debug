import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rotexturerequestevent.md
export function pushRoTextureRequestEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$id',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetId()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$state',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetState()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$uri',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetURI()`,
        lazy: true,
        value: '',
        children: []
    });


    pushCustomVariableToContainer(container, {
        name: '$bitmap',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetBitmap()`,
        value: '',
        children: []
    });
}
