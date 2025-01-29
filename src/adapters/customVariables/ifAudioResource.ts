import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifaudioresource.md
export function pushIfAudioResourceVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$isPlaying',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsPlaying()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$maxSimulStreams',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.MaxSimulStreams()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$metadata',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetMetaData()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
