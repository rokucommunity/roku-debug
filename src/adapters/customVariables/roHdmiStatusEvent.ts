import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rohdmistatusevent.md
export function pushRoHdmiStatusEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$isHdmiStatus',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsHdmiStatus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$message',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMessage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$index',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetIndex()`,
        value: 0,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$info',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });
}
