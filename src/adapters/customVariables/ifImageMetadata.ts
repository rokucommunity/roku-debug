import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifimagemetadata.md
export function pushIfImageMetadataVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$metadata',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMetadata()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$thumbnail',
        type: '',
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetThumbnail()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$rawExif',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRawExif()`,
        lazy: true,
        value: '',
        children: []
    });
}
