import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifhttpagent.md
export function pushIfHttpAgentVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
}
