/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import { util } from '../../../util';
import { ErrorCode } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolResponse, ProtocolResponseData, ProtocolResponseErrorData } from '../ProtocolEvent';

export class VariablesResponse implements ProtocolResponse {

    public static fromJson(data: {
        requestId: number;
        variables: Variable[];
        errorData?: ProtocolResponseErrorData;
    }) {
        const response = new VariablesResponse();
        protocolUtil.loadJson(response, data);
        response.data.variables ??= [];
        //validate that any object marked as `isContainer` either has an array of children or has an element count
        for (const variable of response.flattenVariables(response.data.variables)) {
            const hasChildrenArray = Array.isArray(variable.children);
            if (variable.childCount > 0 || hasChildrenArray) {
                variable.isContainer = true;
            }
            if (hasChildrenArray) {
                delete variable.childCount;
            }
            if (util.isNullish(variable.isContainer)) {
                variable.isContainer = [VariableType.AssociativeArray, VariableType.Array, VariableType.List, VariableType.Object, VariableType.SubtypedObject].includes(variable.type);
            }
            if (variable.isContainer && util.isNullish(variable.childCount) && !hasChildrenArray) {
                throw new Error('Container variable must have one of these properties defined: childCount, children');
            }
            variable.isVirtual ??= false;
        }
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new VariablesResponse();
        protocolUtil.bufferLoaderHelper(response, buffer, 12, (smartBuffer: SmartBuffer) => {
            protocolUtil.loadCommonResponseFields(response, smartBuffer);
            const numVariables = smartBuffer.readUInt32LE(); // num_variables


            const variables: Array<Variable & { isChildKey: boolean }> = [];
            let latestContainer: Variable;
            let variableCount = 0;
            // build the list of BreakpointInfo
            for (let i = 0; i < numVariables; i++) {
                const variable = response.readVariable(smartBuffer);
                variableCount++;
                if (variable.isChildKey === false) {
                    latestContainer = variable as any;
                    delete variable.childCount;
                    latestContainer.children = [];
                    variables.push(variable);
                } else if (latestContainer) {
                    latestContainer.children.push(variable);
                } else {
                    variables.push(variable);
                }
                delete variable.isChildKey;
            }
            response.data.variables = variables;

            return variableCount === numVariables;
        });
        return response;
    }

    private readVariable(smartBuffer: SmartBuffer): Variable & { isChildKey: boolean } {
        if (smartBuffer.length < 13) {
            throw new Error('Not enough bytes to create a variable');
        }
        const variable = {} as Variable & { isChildKey: boolean };
        const flags = smartBuffer.readUInt8();

        // Determine the different variable properties
        variable.isChildKey = (flags & VariableFlags.isChildKey) > 0;
        variable.isConst = (flags & VariableFlags.isConst) > 0;
        variable.isContainer = (flags & VariableFlags.isContainer) > 0;
        const isNameHere = (flags & VariableFlags.isNameHere) > 0;
        const isRefCounted = (flags & VariableFlags.isRefCounted) > 0;
        const isValueHere = (flags & VariableFlags.isValueHere) > 0;
        variable.isVirtual = (flags & VariableFlags.isVirtual) > 0;
        const variableTypeCode = smartBuffer.readUInt8();
        variable.type = VariableTypeCode[variableTypeCode] as VariableType; // variable_type

        if (isNameHere) {
            // we have a name. Pull it out of the buffer.
            variable.name = protocolUtil.readStringNT(smartBuffer); //name
        }

        if (isRefCounted) {
            // This variables reference counts are tracked and we can pull it from the buffer.
            variable.refCount = smartBuffer.readUInt32LE();
        } else {
            variable.refCount = 0;
        }

        if (variable.isContainer) {
            // It is a form of container object.
            // Are the key strings or integers for example
            variable.keyType = VariableTypeCode[smartBuffer.readUInt8()] as VariableType;
            // Equivalent to length on arrays
            variable.childCount = smartBuffer.readUInt32LE();
        }

        if (isValueHere) {
            // Pull out the variable data based on the type if that type returns a value
            variable.value = this.readVariableValue(variable.type, smartBuffer);
        }
        return variable;
    }

    private readVariableValue(variableType: VariableType, smartBuffer: SmartBuffer) {
        switch (variableType) {
            case VariableType.Interface:
            case VariableType.Object:
            case VariableType.String:
            case VariableType.Subroutine:
            case VariableType.Function:
                return protocolUtil.readStringNT(smartBuffer);
            case VariableType.SubtypedObject:
                let names = [];
                for (let i = 0; i < 2; i++) {
                    names.push(protocolUtil.readStringNT(smartBuffer));
                }
                return names.join('; ');
            case VariableType.Boolean:
                return smartBuffer.readUInt8() > 0;
            case VariableType.Integer:
                return smartBuffer.readInt32LE();
            case VariableType.LongInteger:
                return smartBuffer.readBigInt64LE();
            case VariableType.Float:
                return smartBuffer.readFloatLE();
            case VariableType.Double:
                return smartBuffer.readDoubleLE();
            case VariableType.Uninitialized:
            case VariableType.Unknown:
            case VariableType.Invalid:
            case VariableType.AssociativeArray:
            case VariableType.Array:
            case VariableType.List:
                return null;
            default:
                throw new Error('Unable to determine the variable value');
        }
    }

    private flattenVariables(variables: Variable[]) {
        //flatten the variables
        const result = [] as Variable[];
        for (let rootVariable of variables ?? []) {
            result.push(rootVariable);
            //add all child variables to the array
            for (const child of rootVariable.children ?? []) {
                result.push(child);
            }
        }
        //catch duplicates and circular references
        for (let i = 0; i < result.length; i++) {
            const idx = result.indexOf(result[i], i + 1);
            if (idx > -1) {
                throw new Error(`The variable at index ${idx} already exists at index ${i}. You have a circular reference in your variables that needs to be resolved`);
            }
        }
        return result;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();
        const variables = this.flattenVariables(this.data.variables);
        smartBuffer.writeUInt32LE(variables.length); // num_variables
        for (const variable of variables) {
            this.writeVariable(variable, smartBuffer);
        }
        protocolUtil.insertCommonResponseFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    private writeVariable(variable: Variable, smartBuffer: SmartBuffer) {

        let flags = 0;
        //variables that have children are NOT child keys themselves
        flags |= Array.isArray(variable.children) ? 0 : VariableFlags.isChildKey;
        flags |= variable.isConst ? VariableFlags.isConst : 0;
        flags |= variable.isContainer ? VariableFlags.isContainer : 0;
        flags |= variable.isVirtual ? VariableFlags.isVirtual : 0;

        const isNameHere = !util.isNullish(variable.name);
        flags |= isNameHere ? VariableFlags.isNameHere : 0;

        const isRefCounted = variable.refCount > 0;
        flags |= isRefCounted ? VariableFlags.isRefCounted : 0;

        const isValueHere = !util.isNullish(variable.value);
        flags |= isValueHere ? VariableFlags.isValueHere : 0;

        smartBuffer.writeUInt8(flags); //flags
        smartBuffer.writeUInt8(VariableTypeCode[variable.type] as number); // variable_type

        if (isNameHere) {
            smartBuffer.writeStringNT(variable.name); //name
        }

        if (isRefCounted) {
            smartBuffer.writeUInt32LE(variable.refCount); //ref_count
        }

        if (variable.isContainer) {
            smartBuffer.writeUInt8(VariableTypeCode[variable.keyType] as number); // key_type
            // Equivalent to .length on arrays
            smartBuffer.writeUInt32LE(
                variable.children?.length ?? variable.childCount
            ); // element_count
        }

        if (isValueHere) {
            // write the variable data based on the type
            this.writeVariableValue(variable.type, variable.value, smartBuffer);
        }
        return variable;
    }


    private writeVariableValue(variableType: VariableType, value: any, smartBuffer: SmartBuffer): void {
        switch (variableType) {
            case VariableType.Interface:
            case VariableType.Object:
            case VariableType.String:
            case VariableType.Subroutine:
            case VariableType.Function:
                smartBuffer.writeStringNT(value as string);
                break;
            case VariableType.SubtypedObject:
                const names = (value as string ?? '').split('; ');
                if (names.length !== 2) {
                    throw new Error('Expected two names for subtyped object');
                }
                for (const name of names) {
                    smartBuffer.writeStringNT(name);
                }
                break;
            case VariableType.Boolean:
                smartBuffer.writeUInt8(value === true ? 1 : 0);
                break;
            case VariableType.Integer:
                smartBuffer.writeInt32LE(value as number);
                break;
            case VariableType.LongInteger:
                smartBuffer.writeBigInt64LE(
                    typeof value === 'bigint' ? value : BigInt(value as number)
                );
                break;
            case VariableType.Float:
                smartBuffer.writeFloatLE(value as number);
                break;
            case VariableType.Double:
                smartBuffer.writeDoubleLE(value as number);
                break;
            case VariableType.Uninitialized:
            case VariableType.Unknown:
            case VariableType.Invalid:
            case VariableType.AssociativeArray:
            case VariableType.Array:
            case VariableType.List:
                break;
            default:
                throw new Error('Unable to determine the variable value');
        }
    }

    public success = false;

    public readOffset = 0;

    public data = {
        packetLength: undefined as number,
        errorCode: ErrorCode.OK
    } as VariablesResponseData;
}
export interface VariablesResponseData extends ProtocolResponseData {
    variables: Variable[];
}

export enum VariableFlags {
    /**
     * value is a child of the requested variable
     * e.g., an element of an array or field of an AA
     */
    isChildKey = 1,
    /**
     * value is constant
     */
    isConst = 2,
    /**
     * The referenced value is a container (e.g., a list or array)
     */
    isContainer = 4,
    /**
     * The name is included in this VariableInfo
     */
    isNameHere = 8,
    /**
     * value is reference-counted.
     */
    isRefCounted = 16,
    /**
     * value is included in this VariableInfo
     */
    isValueHere = 32,
    /**
     * Value is container, key lookup is case sensitive
     * @since protocol 3.1.0
     */
    isKeysCaseSensitive = 64,
    /**
     * Indicates whether the associated variable is virtual or not.
     * @since protocol 3.3.0
     */
    isVirtual = 128
}

/**
 * Every type of variable supported by the protocol
 */
export enum VariableType {
    AssociativeArray = 'AssociativeArray',
    Array = 'Array',
    Boolean = 'Boolean',
    Double = 'Double',
    Float = 'Float',
    Function = 'Function',
    Integer = 'Integer',
    Interface = 'Interface',
    Invalid = 'Invalid',
    List = 'List',
    LongInteger = 'LongInteger',
    Object = 'Object',
    String = 'String',
    Subroutine = 'Subroutine',
    SubtypedObject = 'SubtypedObject',
    Uninitialized = 'Uninitialized',
    Unknown = 'Unknown'
}

/**
 * An enum used to convert VariableType strings to their protocol integer value
 */
enum VariableTypeCode {
    AssociativeArray = 1,
    Array = 2,
    Boolean = 3,
    Double = 4,
    Float = 5,
    Function = 6,
    Integer = 7,
    Interface = 8,
    Invalid = 9,
    List = 10,
    LongInteger = 11,
    Object = 12,
    String = 13,
    Subroutine = 14,
    SubtypedObject = 15,
    Uninitialized = 16,
    Unknown = 17
}

export interface Variable {
    /**
     * 0 means this var isn't refCounted, and thus `refCount` will be omitted from reading and writing to buffer
     */
    refCount: number;
    /**
     * I think this means "is this mutatable". Like an object would be isConst=false, but "some string" can only be replaced by a totally new string? But don't quote me on this
     */
    isConst: boolean;
    /**
     * A type-dependent value based on the `variableType` field. It is not present for all types
     */
    value: string | number | bigint | boolean | null;
    /**
     * The type of variable or value.
     */
    type: VariableType;
    /**
     * The variable name. `undefined` means there was no variable name available
     */
    name?: string;
    /**
     * If this variable is a container, what variable type are its keys? (integer for array, string for AA, etc...).
     * TODO can we get roku to narrow this a bit?
     */
    keyType?: VariableType;
    /**
     * Is this variable a container var (i.e. an array or object with children)
     */
    isContainer: boolean;
    /**
     * Indicates whether the associated variable is virtual or not.
     */
    isVirtual?: boolean;
    /**
     * If the variable is a container, it will have child elements. this is the number of those children. If `.children` is set, this field will be set to undefined
     * (meaning it will be ignored during serialization)
     */
    childCount?: number;
    /**
     * The full list of children for this variable. The entire Variable response may not be more than 2 total levels deep.
     * (i.e. `parent` -> `children[]`). Children may not have additional children, those would need to be resolve using subsequent `variables` requests.
     */
    children?: Variable[];
}
