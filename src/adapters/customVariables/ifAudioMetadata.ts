import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifaudiometadata.md
export function pushIfAudioMetadataVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$tags',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTags()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audioproperties',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAudioProperties()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$coverart',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCoverArt()`,
        value: '',
        children: []
    });
}
