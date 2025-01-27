import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifaudiometadata.md
export function pushIfAudioMetadataVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$tags',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTags()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audioProperties',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAudioProperties()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$coverArt',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCoverArt()`,
        lazy: true,
        value: '',
        children: []
    });
}
