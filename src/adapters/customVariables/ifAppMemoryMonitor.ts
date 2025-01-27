import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifappmemorymonitor.md
export function pushIfAppMemoryMonitorVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$memoryLimitPercent',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMemoryLimitPercent()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$channelAvailableMemory',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChannelAvailableMemory()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$channelMemoryLimit',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChannelMemoryLimit()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
