import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodehttpagentaccess.md
export function pushIfSGNodeHttpAgentAccessVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$httpAgent',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getHttpAgent()`,
        value: '',
        children: []
    });
}
