import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifurltransfer.md
export function pushIfUrlTransferVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$url',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getUrl()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$useragent',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUserAgent()`,
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
        name: '$request',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRequest()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$identity',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetIdentity()`,
        lazy: true,
        value: '',
        children: []
    });
}
