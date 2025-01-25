import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifaudioresource.md
export function pushIfAudioResourceVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$playing',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsPlaying()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$maxsimulstreams',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.MaxSimulStreams()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$metadata',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMetaData()`,
        value: '',
        children: []
    });
}
