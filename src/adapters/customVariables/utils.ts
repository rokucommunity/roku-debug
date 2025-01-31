import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import { HighLevelType } from '../../interfaces';
import type { DebugProtocolAdapter } from '../DebugProtocolAdapter';
import { KeyType, type EvaluateContainer } from '../DebugProtocolAdapter';

/**
 * Push a custom variable to the container if it doesn't already exist.
 */
export function pushCustomVariableToContainer(adapter: DebugProtocolAdapter, container: EvaluateContainer, customVariable: EvaluateContainer) {
    if (!container.children.some(child => child.name.toLowerCase() === customVariable.name.toLowerCase() && child.presentationHint?.kind === customVariable.presentationHint?.kind)) {
        if (adapter.autoResolveVirtualVariables) {
            if (!customVariable.presentationHint) {
                customVariable.presentationHint = {};
            }
            customVariable.presentationHint.lazy = false;
            customVariable.evaluateNow = true;
        }

        customVariable.isCustom = true;

        if (customVariable.type === VariableType.AssociativeArray || customVariable.type === VariableType.Object || customVariable.type === VariableType.SubtypedObject) {
            customVariable.highLevelType = HighLevelType.object;
            customVariable.keyType = KeyType.string;
        } else if (customVariable.type === VariableType.Array || customVariable.type === VariableType.List) {
            customVariable.highLevelType = HighLevelType.array;
            customVariable.keyType = KeyType.integer;
        }

        container.children.push(customVariable);
    }
}
