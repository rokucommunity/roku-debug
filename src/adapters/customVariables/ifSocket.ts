import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocket.md
export function pushIfSocketVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$address',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sendtoaddress',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSendToAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$receivedfromaddress',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetReceivedFromAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countrcvbuf',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCountRcvBuf()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countsendbuf',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCountSendBuf()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$status',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.Status()`,
        lazy: true,
        value: '',
        children: []
    });

}
