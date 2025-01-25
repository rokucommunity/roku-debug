import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rosgscreenevent.md
export function pushRoSGScreenEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$screenclosed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isScreenClosed()`,
        lazy: true,
        value: '',
        children: []
    });
}
