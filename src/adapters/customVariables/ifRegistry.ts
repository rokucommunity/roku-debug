import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifregistry.md
export function pushIfRegistryVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$spaceAvailable',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSpaceAvailable()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sectionList',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSectionList()`,
        value: '',
        children: []
    });
}
