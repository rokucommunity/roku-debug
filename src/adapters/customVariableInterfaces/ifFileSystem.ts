import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffilesystem.md
export function pushIfFileSystemVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$volumeList',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVolumeList()`,
        value: '',
        children: []
    });
}
