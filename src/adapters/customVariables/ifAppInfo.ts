import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifappinfo.md
export function pushIfAppInfoVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$id',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetID()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$isDev',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsDev()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$version',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetVersion()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$title',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTitle()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$devID',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDevID()`,
        value: '',
        children: []
    });
}
