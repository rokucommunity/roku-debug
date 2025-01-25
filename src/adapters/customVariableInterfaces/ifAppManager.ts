import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifappmanager.md
export function pushIfAppManagerVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$uptime',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUptime().TotalMilliseconds()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$screensavertimeout',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetScreensaverTimeout()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$lastexitinfo',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetLastExitInfo()`,
        value: '',
        children: []
    });
}
