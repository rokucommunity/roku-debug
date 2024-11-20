import * as semver from 'semver';
import { KeyType } from './DebugProtocolAdapter';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';

export function insertCustomVariablesHelpers(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    if (!semver.satisfies(adapter?.activeProtocolVersion, '<3.3.0')) {
        return;
    }
    if (container?.value?.startsWith('roSGNode')) {
        let nodeChildren = <EvaluateContainer>{
            name: '[[children]]',
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
            name: '[[count]]',
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
