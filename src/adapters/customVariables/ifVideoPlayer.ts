import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifvideoplayer.md
export function pushIfVideoPlayerVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$playbackDuration',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPlaybackDuration()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audioTracks',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAudioTracks()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$captionRenderer',
        type: 'roCaptionRenderer',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCaptionRenderer()`,
        value: '',
        children: []
    });
}
