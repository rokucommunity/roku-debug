import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifprogramguide.md
export function pushIfProgramGuideVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$version',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVersion()`,
        lazy: true,
        value: '',
        children: []
    });
}
