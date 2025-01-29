import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifappinfo.md
export function pushIfAppInfoVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$id',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetID()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isDev',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsDev()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$version',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetVersion()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$title',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTitle()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$devID',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDevID()`,
        value: '',
        children: []
    });
}
