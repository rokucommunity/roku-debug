import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifbytearray.md
export function pushIfByteArrayVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$hexString',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.ToHexString()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$base64String',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.ToBase64String()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$asciiString',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.ToAsciiString()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$crc32',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCRC32()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$littleEndianCPU',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsLittleEndianCPU()`,
        value: '',
        children: []
    });
}
