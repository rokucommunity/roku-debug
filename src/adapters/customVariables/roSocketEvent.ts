import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rosocketevent.md
export function pushRoSocketEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$socketID',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSocketID()`,
        lazy: true,
        value: '',
        children: []
    });
}
