import * as semver from 'semver';
import { KeyType } from './DebugProtocolAdapter';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';

/**
 * Insert custom variables into the `EvaluateContainer`. Most of these are for compatibility with older versions of the BrightScript debug protocol,
 * but occasionally can be adding new functionality for properties that don't exist in the debug protocol. Some of these will run `evaluate` commands
 * to look up the data for the custom variables.
 */
export async function insertCustomVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer): Promise<void> {
    if (semver.satisfies(adapter?.activeProtocolVersion, '<3.3.0')) {
        if (container?.value?.startsWith('roSGNode')) {
            let nodeChildren = <EvaluateContainer>{
                name: '$children',
                type: 'roArray',
                highLevelType: 'array',
                keyType: KeyType.integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.getChildren(-1, 0)`,
                children: []
            };
            container.children.push(nodeChildren);
        }
        if (container.elementCount > 0 || container.type === 'Array') {
            let nodeCount = <EvaluateContainer>{
                name: '$count',
                evaluateName: container.elementCount.toString(),
                type: 'number',
                highLevelType: undefined,
                keyType: undefined,
                presentationHint: 'virtual',
                value: container.elementCount.toString(),
                elementCount: undefined,
                children: []
            };
            container.children.push(nodeCount);
        }
    }
    await Promise.resolve();
}
