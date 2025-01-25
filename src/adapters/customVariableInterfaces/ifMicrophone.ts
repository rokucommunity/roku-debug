import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifmicrophone.md
export function pushIfMicrophoneVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$canrecord',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.CanRecord()`,
        lazy: true,
        value: '',
        children: []
    });
}
