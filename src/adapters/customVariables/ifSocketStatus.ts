import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsocketstatus.md
export function pushIfSocketStatusVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$eAgain',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eAgain()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eAlready',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eAlready()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eBadAddr',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eBadAddr()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eDestAddrReq',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eDestAddrReq()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eHostUnreach',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eHostUnreach()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eInvalid',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eInvalid()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eInProgress',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eInProgress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eWouldBlock',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eWouldBlock()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eSuccess',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eSuccess()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$eOK',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.eOK()`,
        lazy: true,
        value: '',
        children: []
    });
}
