import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifvideoplayer.md
export function pushIfVideoPlayerVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$playbackDuration',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetPlaybackDuration()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$audioTracks',
        type: VariableType.Array,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetAudioTracks()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$captionRenderer',
        type: 'roCaptionRenderer',
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetCaptionRenderer()`,
        value: '',
        children: []
    });
}
