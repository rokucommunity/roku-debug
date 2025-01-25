import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

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
        name: '$responsecode',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponseCode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$failurereason',
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
        name: '$responseheaders',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponseHeaders()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$targetipaddress',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTargetIpAddress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$responseheadersarray',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponseHeadersArray()`,
        value: '',
        children: []
    });
}
