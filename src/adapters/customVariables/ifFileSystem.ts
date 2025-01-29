import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iffilesystem.md
export function pushIfFileSystemVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$volumeList',
        type: VariableType.List,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetVolumeList()`,
        value: '',
        children: []
    });
}
