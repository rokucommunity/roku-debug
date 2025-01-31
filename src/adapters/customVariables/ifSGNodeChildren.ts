import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodechildren.md
export function pushIfSGNodeChildrenVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(adapter, container, {
        name: '$parent',
        type: VariableType.SubtypedObject,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.getParent()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$children',
        type: VariableType.Array,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.getChildren(-1, 0)`,
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$childCount',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.getChildCount()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(adapter, container, {
        name: '$scene',
        type: VariableType.SubtypedObject,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.getScene()`,
        value: '',
        children: []
    });

    // Should be add these? They might cause more harm then good?
    // pushCustomVariableToContainer(container, {
    //     name: '$all',
    //     type: '',
    //     presentationHint: { kind: 'virtual', lazy: true },
    //     evaluateName: `${expression}.getAll()`,
    //     value: '',
    //     children: []
    // });

    // pushCustomVariableToContainer(container, {
    //     name: '$roots',
    //     type: '',
    //     presentationHint: { kind: 'virtual', lazy: true },
    //     evaluateName: `${expression}.getRoots()`,
    //     value: '',
    //     children: []
    // });

    // pushCustomVariableToContainer(container, {
    //     name: '$rootsMeta',
    //     type: '',
    //     presentationHint: { kind: 'virtual', lazy: true },
    //     evaluateName: `${expression}.getRootsMeta()`,
    //     value: '',
    //     children: []
    // });

    // pushCustomVariableToContainer(container, {
    //     name: '$allMeta',
    //     type: '',
    //     presentationHint: { kind: 'virtual', lazy: true },
    //     evaluateName: `${expression}.getAllMeta()`,
    //     value: '',
    //     children: []
    // });
}
