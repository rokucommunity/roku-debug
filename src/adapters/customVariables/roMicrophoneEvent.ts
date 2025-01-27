import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/romicrophoneevent.md
export function pushRoMicrophoneEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$isRecordingDone',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRecordingDone()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRecordingInfo',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRecordingInfo()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$info',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
