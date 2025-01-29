import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocket.md
export function pushIfSocketVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$address',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$sendToAddress',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetSendToAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$receivedFromAddress',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetReceivedFromAddress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countRcvBuf',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCountRcvBuf()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countSendBuf',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCountSendBuf()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$status',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.Status()`,
        value: '',
        children: []
    });

}
