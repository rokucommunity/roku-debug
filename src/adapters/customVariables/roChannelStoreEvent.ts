import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rochannelstoreevent.md
export function pushRoChannelStoreEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {

    pushCustomVariableToContainer(container, {
        name: '$requestsucceeded',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isRequestSucceeded()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$response',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetResponse()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$requestfailed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isRequestFailed()`,
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
        name: '$statusmessage',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetStatusMessage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$requestinterrupted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isRequestInterrupted()`,
        lazy: true,
        value: 0,
        children: []
    });

}
