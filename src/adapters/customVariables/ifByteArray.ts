import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifbytearray.md
export function pushIfByteArrayVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$hexString',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToHexString()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$base64String',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToBase64String()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$asciiString',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToAsciiString()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$crc32',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCRC32()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$littleEndianCPU',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsLittleEndianCPU()`,
        lazy: true,
        value: '',
        children: []
    });
}
