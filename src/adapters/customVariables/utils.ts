import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import { HighLevelType } from '../../interfaces';
import { KeyType, type EvaluateContainer } from '../DebugProtocolAdapter';

// For debugging this can be flipped to true to force all custom variables to be loaded right away.
// Useful for spotting issues with a specific custom variable.
const forceLoad = false;

/**
 * Push a custom variable to the container if it doesn't already exist.
 */
export function pushCustomVariableToContainer(container: EvaluateContainer, customVariable: EvaluateContainer) {
    if (!container.children.some(child => child.name === customVariable.name && child.presentationHint === customVariable.presentationHint)) {
        if (forceLoad && customVariable.type !== VariableType.Array && customVariable.type !== VariableType.AssociativeArray) {
            customVariable.lazy = false;
            customVariable.evaluateNow = true;
        }

        if (customVariable.type === VariableType.AssociativeArray || customVariable.type === VariableType.Object || customVariable.type === VariableType.SubtypedObject) {
            customVariable.highLevelType = HighLevelType.object;
            customVariable.keyType = KeyType.string;
        } else if (customVariable.type === VariableType.Array) {
            customVariable.highLevelType = HighLevelType.array;
            customVariable.keyType = KeyType.integer;
        }

        container.children.push(customVariable);
    }
}
