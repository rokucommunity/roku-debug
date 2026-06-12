import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgscreen.md
export function pushIfSGScreenVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$messagePort',
        type: VariableType.Object,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetMessagePort()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$globalNode',
        type: VariableType.Object,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.getGlobalNode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$scene',
        type: VariableType.SubtypedObject,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetScene()`,
        value: '',
        children: []
    });
}
