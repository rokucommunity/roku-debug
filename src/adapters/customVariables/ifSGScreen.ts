import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgscreen.md
export function pushIfSGScreenVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$messagePort',
        type: '',
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMessagePort()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$globalNode',
        type: VariableType.Object,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.getGlobalNode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$scene',
        type: VariableType.Object,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetScene()`,
        value: '',
        children: []
    });
}
