import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsourceidentity.md
export function pushIfSourceIdentityVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$sourceIdentity',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSourceIdentity()`,
        lazy: true,
        value: '',
        children: []
    });
}
