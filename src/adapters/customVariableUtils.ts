import * as semver from 'semver';
import { KeyType } from './DebugProtocolAdapter';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';
import { HighLevelType } from '../interfaces';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';

import * as customVariables from './customVariableInterfaces/interfaces';

enum RokuObjectTypes {
    roAppInfo = 'roAppInfo',
    roAppManager = 'roAppManager',
    roAudioMetadata = 'roAudioMetadata',
    roDateTime = 'roDateTime',
    roDeviceInfo = 'roDeviceInfo',
    roUrlTransfer = 'roUrlTransfer'
}

/**
 * Insert custom variables into the `EvaluateContainer`. Most of these are for compatibility with older versions of the BrightScript debug protocol,
 * but occasionally can be for adding new functionality for properties that don't exist in the debug protocol. Some of these will run `evaluate` commands
 * to look up the data for the custom variables.
 */
export async function insertCustomVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    try {
        // Added natively as of 3.3.0
        if (semver.satisfies(adapter?.activeProtocolVersion, '<3.3.0')) {
            if (container?.type?.startsWith('roSGNode')) {
                customVariables.pushCustomVariableToContainer(container, {
                    name: '$children',
                    type: VariableType.Array,
                    keyType: KeyType.integer,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getChildren(-1, 0)`,
                    children: []
                });

                customVariables.pushCustomVariableToContainer(container, {
                    name: '$parent',
                    type: 'roSGNode',
                    highLevelType: HighLevelType.object,
                    keyType: KeyType.string,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getParent()`,
                    children: []
                });

                customVariables.pushCustomVariableToContainer(container, {
                    name: '$threadinfo',
                    type: VariableType.AssociativeArray,
                    keyType: KeyType.string,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.threadInfo()`,
                    children: []
                });
            }

            if (container.elementCount > 0 || container.type === 'Array') {
                customVariables.pushCustomVariableToContainer(container, {
                    name: '$count',
                    type: VariableType.Integer,
                    presentationHint: 'virtual',
                    evaluateName: container.elementCount.toString(),
                    value: container.elementCount.toString(),
                    children: []
                });
            }
        }

        switch (container.type) {
            case RokuObjectTypes.roAppInfo:
                customVariables.pushIfAppInfoVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAppManager:
                customVariables.pushIfAppManagerVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAudioMetadata:
                customVariables.pushIfAudioMetadataVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roDateTime:
                customVariables.pushIfDateTimeVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roDeviceInfo:
                customVariables.pushIfDeviceInfoVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roUrlTransfer:
                customVariables.pushIfUrlTransferVariables(adapter, expression, container);
                break;
            default:
                break;
        }
    } catch (e) {
        // Error inserting custom variables. We don't want to cause issues with real variables so just move on for now.
    }
    await Promise.resolve();
}

/**
 * Override the key types in preparation for custom variables if required.
 */
export function overrideKeyTypesForCustomVariables(adapter: DebugProtocolAdapter, container: EvaluateContainer) {
    if (!container.keyType) {
        if (RokuObjectTypes[container.type]) {
            container.keyType = KeyType.string;
        }
    }
}
