import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rourlevent.md
export function pushRoUrlEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$int',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetInt()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseCode',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetResponseCode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$failureReason',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetFailureReason()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$string',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetString()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseHeaders',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetResponseHeaders()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$targetIpAddress',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTargetIpAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseHeadersArray',
        type: VariableType.Array,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetResponseHeadersArray()`,
        value: '',
        children: []
    });
}
