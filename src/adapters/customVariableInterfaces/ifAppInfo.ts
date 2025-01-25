import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifappinfo.md
export function pushIfAppInfoVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$id',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetID()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$dev',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsDev()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$version',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVersion()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$title',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTitle()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$devid',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDevID()`,
        lazy: true,
        value: '',
        children: []
    });
}
