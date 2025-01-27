import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketconnectionoption.md
export function pushIfSocketConnectionOptionVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$keepAlive',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetKeepAlive()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$linger',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetLinger()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$maxSeg',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMaxSeg()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$noDelay',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetNoDelay()`,
        lazy: true,
        value: '',
        children: []
    });
}
