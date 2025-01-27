import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifappmanager.md
export function pushIfAppManagerVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$upTime',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUptime().TotalMilliseconds()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$screenSaverTimeout',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetScreensaverTimeout()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$lastExitInfo',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetLastExitInfo()`,
        value: '',
        children: []
    });
}
