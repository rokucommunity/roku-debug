import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgscreen.md
export function pushIfSGScreenVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$messageport',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMessagePort()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$globalnode',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getGlobalNode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$scene',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetScene()`,
        value: '',
        children: []
    });
}
