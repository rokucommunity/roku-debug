import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iftexturerequest.md
export function pushIfTextureRequestVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
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
}
