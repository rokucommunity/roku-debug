import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './interfaces';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/ifbytearray.md
export function pushIfByteArrayVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$hexstring',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToHexString()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$base64string',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.ToBase64String()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$asciistring',
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
        name: '$littleendiancpu',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsLittleEndianCPU()`,
        lazy: true,
        value: '',
        children: []
    });
}
