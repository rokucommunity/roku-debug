import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffontregistry.md
export function pushIfFontRegistryVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$families',
        type: VariableType.List,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetFamilies()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$defaultFont',
        type: VariableType.Object,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDefaultFont()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$defaultFontSize',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDefaultFontSize()`,
        value: '',
        children: []
    });
}
