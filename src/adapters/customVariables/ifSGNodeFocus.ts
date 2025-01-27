import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodefocus.md
export function pushIfSGNodeFocusVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$hasfocus',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.hasFocus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$infocuschain',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isInFocusChain()`,
        lazy: true,
        value: '',
        children: []
    });
}
