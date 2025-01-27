import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rourlevent.md
export function pushRoUrlEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$int',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInt()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseCode',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponseCode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$failureReason',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetFailureReason()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$string',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetString()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseHeaders',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponseHeaders()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$targetIpAddress',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTargetIpAddress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseHeadersArray',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponseHeadersArray()`,
        value: '',
        children: []
    });
}
