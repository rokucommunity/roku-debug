import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifsgnodechildren.md
export function pushIfSGNodeChildrenVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$parent',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getParent()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$children',
        type: VariableType.Array,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getChildren(-1, 0)`,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$childcount',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getChildCount()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$scene',
        type: VariableType.Object,
        presentationHint: 'virtual',
        evaluateName: `${expression}.getScene()`,
        value: '',
        children: []
    });

    // Should be add these? They might cause more harm then good?
    // pushCustomVariableToContainer(container, {
    //     name: '$all',
    //     type: VariableType.Object,
    //     presentationHint: 'virtual',
    //     evaluateName: `${expression}.getAll()`,
    //     value: '',
    //     children: []
    // });

    // pushCustomVariableToContainer(container, {
    //     name: '$roots',
    //     type: VariableType.Object,
    //     presentationHint: 'virtual',
    //     evaluateName: `${expression}.getRoots()`,
    //     value: '',
    //     children: []
    // });

    // pushCustomVariableToContainer(container, {
    //     name: '$rootsmeta',
    //     type: VariableType.Object,
    //     presentationHint: 'virtual',
    //     evaluateName: `${expression}.getRootsMeta()`,
    //     value: '',
    //     children: []
    // });

    // pushCustomVariableToContainer(container, {
    //     name: '$allmeta',
    //     type: VariableType.Object,
    //     presentationHint: 'virtual',
    //     evaluateName: `${expression}.getAllMeta()`,
    //     value: '',
    //     children: []
    // });
}
