import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifchannelstore.md
export function pushIfChannelStoreVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$identity',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetIdentity()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$userRegionData',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUserRegionData()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$channelCred',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChannelCred()`,
        value: '',
        children: []
    });
}
