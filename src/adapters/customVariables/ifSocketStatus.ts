import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketstatus.md
export function pushIfSocketStatusVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$eagain',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eAgain()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ealready',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eAlready()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ebadaddr',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eBadAddr()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$edestaddrreq',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eDestAddrReq()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ehostunreach',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eHostUnreach()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$einvalid',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eInvalid()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$einprogress',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eInProgress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ewouldblock',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eWouldBlock()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$esuccess',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eSuccess()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eok',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eOK()`,
        lazy: true,
        value: '',
        children: []
    });
}
