import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffontregistry.md
export function pushIfFontRegistryVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$families',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetFamilies()`,
        lazy: true,
        value: '',
        children: []
    });

    // TODO: needs some testing as I'm not yet sure the actual return type
    // pushCustomVariableToContainer(container, {
    //     name: '$defaultfont',
    //     type: VariableType.Object,
    //     presentationHint: 'virtual',
    //     evaluateName: `${expression}.GetDefaultFont()`,
    //     lazy: true,
    //     value: '',
    //     children: []
    // });

    pushCustomVariableToContainer(container, {
        name: '$defaultfontsize',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDefaultFontSize()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$maxadvance',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMaxAdvance()`,
        lazy: true,
        value: '',
        children: []
    });
}
