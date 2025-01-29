import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iftimespan.md
export function pushIfTimeSpanVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$totalMilliseconds',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.TotalMilliseconds()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$totalSeconds',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.TotalSeconds()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$totalMicroseconds',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.TotalMicroseconds()`,
        value: '',
        children: []
    });
}
