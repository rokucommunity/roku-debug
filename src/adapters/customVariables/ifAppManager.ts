import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifappmanager.md
export function pushIfAppManagerVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$upTime',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetUptime().TotalMilliseconds()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$screenSaverTimeout',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetScreensaverTimeout()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$lastExitInfo',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetLastExitInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
