import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifimagemetadata.md
export function pushIfImageMetadataVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$metadata',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMetadata()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$thumbnail',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetThumbnail()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$rawExif',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRawExif()`,
        value: '',
        children: []
    });
}
