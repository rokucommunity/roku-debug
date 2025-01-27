import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffontregistry.md
export function pushIfFontRegistryVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$families',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetFamilies()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$defaultFont',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDefaultFont()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$defaultFontSize',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDefaultFontSize()`,
        lazy: true,
        value: '',
        children: []
    });
}
