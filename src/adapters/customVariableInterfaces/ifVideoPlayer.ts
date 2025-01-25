import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifvideoplayer.md
export function pushIfVideoPlayerVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$playbackduration',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPlaybackDuration()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audiotracks',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAudioTracks()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$captionrenderer',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCaptionRenderer()`,
        value: '',
        children: []
    });
}
