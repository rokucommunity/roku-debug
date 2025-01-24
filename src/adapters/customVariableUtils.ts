import * as semver from 'semver';
import { KeyType } from './DebugProtocolAdapter';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';
import { HighLevelType } from '../interfaces';

/**
 * Insert custom variables into the `EvaluateContainer`. Most of these are for compatibility with older versions of the BrightScript debug protocol,
 * but occasionally can be for adding new functionality for properties that don't exist in the debug protocol. Some of these will run `evaluate` commands
 * to look up the data for the custom variables.
 */
export async function insertCustomVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer): Promise<void> {
    try {
        // Added natively as of 3.3.0
        if (semver.satisfies(adapter?.activeProtocolVersion, '<3.3.0')) {
            if (container?.type?.startsWith('roSGNode')) {
                pushCustomVariableToContainer(container, {
                    name: '$children',
                    type: 'roArray',
                    highLevelType: HighLevelType.array,
                    keyType: KeyType.integer,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getChildren(-1, 0)`,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$parent',
                    type: 'roSGNode',
                    highLevelType: HighLevelType.object,
                    keyType: KeyType.string,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getParent()`,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$threadinfo',
                    type: 'roAssociativeArray',
                    highLevelType: HighLevelType.object,
                    keyType: KeyType.string,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.threadInfo()`,
                    children: []
                });
            }

            if (container.elementCount > 0 || container.type === 'Array') {
                pushCustomVariableToContainer(container, {
                    name: '$count',
                    type: 'Integer',
                    highLevelType: undefined,
                    keyType: undefined,
                    presentationHint: 'virtual',
                    evaluateName: container.elementCount.toString(),
                    value: container.elementCount.toString(),
                    children: []
                });
            }

            if (container.type === 'Object' && container.value === 'roUrlTransfer') {
                pushCustomVariableToContainer(container, {
                    name: '$url',
                    type: 'String',
                    highLevelType: undefined,
                    keyType: undefined,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getUrl()`,
                    lazy: true,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$useragent',
                    type: 'String',
                    highLevelType: undefined,
                    keyType: undefined,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.GetUserAgent()`,
                    lazy: true,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$failurereason',
                    type: 'String',
                    highLevelType: undefined,
                    keyType: undefined,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.GetFailureReason()`,
                    elementCount: undefined,
                    lazy: true,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$request',
                    type: 'String',
                    highLevelType: undefined,
                    keyType: undefined,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.GetRequest()`,
                    elementCount: undefined,
                    lazy: true,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$identity',
                    type: 'Function',
                    highLevelType: undefined,
                    keyType: undefined,
                    presentationHint: 'method',
                    evaluateName: `${expression}.GetIdentity()`,
                    value: undefined,
                    elementCount: undefined,
                    lazy: true,
                    children: []
                });
            }
        }
    } catch (e) {
        // Error inserting custom variables. We don't want to cause issues with real variables so just move on for now.
    }
    await Promise.resolve();
}

function pushCustomVariableToContainer(container: EvaluateContainer, customVariable: EvaluateContainer) {
    if (!container.children.some(child => child.name === customVariable.name)) {
        container.children.push(customVariable);
    }
}
