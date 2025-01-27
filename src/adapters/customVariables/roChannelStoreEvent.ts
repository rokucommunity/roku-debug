import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rochannelstoreevent.md
export function pushRoChannelStoreEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {

    pushCustomVariableToContainer(container, {
        name: '$isRequestSucceeded',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRequestSucceeded()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$response',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponse()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRequestFailed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRequestFailed()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$status',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetStatus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$statusMessage',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetStatusMessage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRequestInterrupted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRequestInterrupted()`,
        lazy: true,
        value: 0,
        children: []
    });

}
