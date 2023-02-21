import type { Variable } from './VariablesResponse';
import { VariablesResponse, VariableType } from './VariablesResponse';
import { expect } from 'chai';
import { ErrorCode } from '../../Constants';
import { SmartBuffer } from 'smart-buffer';
import { expectThrows } from '../../../testHelpers.spec';

describe('VariablesResponse', () => {
    function v(name: string, type: VariableType, value: any, extra?: Record<string, any>) {
        return {
            name: name,
            type: type,
            value: value,
            refCount: 1,
            isConst: false,
            isContainer: false,
            ...extra ?? {}
        };
    }

    describe('fromJson', () => {

        it('defaults variables array to empty array', () => {
            let response = VariablesResponse.fromJson({} as any);
            expect(response.data.variables).to.eql([]);
        });

        it('computes isContainer based on variable type', () => {
            let response = VariablesResponse.fromJson({
                requestId: 2,
                variables: [{
                    type: VariableType.AssociativeArray,
                    children: []
                }, {
                    type: VariableType.Array,
                    children: []
                }, {
                    type: VariableType.List,
                    children: []
                }, {
                    type: VariableType.Object,
                    children: []
                }, {
                    type: VariableType.SubtypedObject,
                    children: []
                }] as any[]
            });
            expect(response.data.variables.map(x => x.isContainer)).to.eql([
                true, true, true, true, true
            ]);
        });

        it('throws if container has no children', () => {
            expectThrows(() => {
                VariablesResponse.fromJson({
                    requestId: 2,
                    variables: [{
                        type: VariableType.AssociativeArray
                    }] as any[]
                });
            }, 'Container variable must have one of these properties defined: childCount, children');
        });
    });

    describe('readVariable', () => {
        it('throws for too-small buffer', () => {
            const response = VariablesResponse.fromJson({} as any);
            expectThrows(() => {
                response['readVariable'](new SmartBuffer());
            }, 'Not enough bytes to create a variable');
        });
    });

    describe('readVariableValue', () => {
        it('returns null for various types', () => {
            expect(VariablesResponse.prototype['readVariableValue'](VariableType.Uninitialized, new SmartBuffer())).to.eql(null);
            expect(VariablesResponse.prototype['readVariableValue'](VariableType.Unknown, new SmartBuffer())).to.eql(null);
            expect(VariablesResponse.prototype['readVariableValue'](VariableType.Invalid, new SmartBuffer())).to.eql(null);
            expect(VariablesResponse.prototype['readVariableValue'](VariableType.AssociativeArray, new SmartBuffer())).to.eql(null);
            expect(VariablesResponse.prototype['readVariableValue'](VariableType.Array, new SmartBuffer())).to.eql(null);
            expect(VariablesResponse.prototype['readVariableValue'](VariableType.List, new SmartBuffer())).to.eql(null);
        });

        it('throws on unknown type', () => {
            expectThrows(() => {
                VariablesResponse.prototype['readVariableValue']('unknown type' as any, new SmartBuffer());
            }, 'Unable to determine the variable value');
        });
    });

    describe('flattenVariables', () => {

        it('does not throw for undefined array', () => {
            expect(
                VariablesResponse.prototype['flattenVariables'](undefined)
            ).to.eql([]);
        });

        it('throws for circular reference', () => {
            const parent = { children: [] } as Variable;
            const child = { children: [] } as Variable;
            parent.children.push(child);
            child.children.push(parent);
            expectThrows(() => {
                VariablesResponse.prototype['flattenVariables']([parent, child]);
            }, `The variable at index 3 already exists at index 0. You have a circular reference in your variables that needs to be resolved`);
        });
    });

    it('skips var name if missing', () => {
        const response = VariablesResponse.fromBuffer(
            VariablesResponse.fromJson({
                requestId: 2,
                variables: [{
                    name: undefined,
                    refCount: 0,
                    isConst: false,
                    isContainer: true,
                    children: [],
                    type: VariableType.AssociativeArray,
                    keyType: VariableType.String,
                    value: undefined
                }]
            }).toBuffer()
        );
        expect(response.data.variables[0].name).not.to.exist;
        expect(response.data.variables[0].refCount).to.eql(0);
    });

    it('handles parent var with children', () => {
        let response = VariablesResponse.fromJson({
            requestId: 2,
            variables: [{
                name: 'person',
                refCount: 2,
                isConst: false,
                isContainer: true,
                type: VariableType.AssociativeArray,
                keyType: VariableType.String,
                value: undefined,
                children: [{
                    name: 'firstName',
                    refCount: 1,
                    value: 'Bob',
                    type: VariableType.String,
                    isContainer: false,
                    isConst: false
                }, {
                    name: 'lastName',
                    refCount: 1,
                    value: undefined,
                    isContainer: false,
                    type: VariableType.Invalid,
                    isConst: false
                }]
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: 2,
            variables: [{
                name: 'person',
                refCount: 2,
                isConst: false,
                isContainer: true,
                type: VariableType.AssociativeArray,
                keyType: 'String',
                value: undefined,
                children: [{
                    name: 'firstName',
                    refCount: 1,
                    value: 'Bob',
                    type: VariableType.String,
                    isContainer: false,
                    isConst: false
                }, {
                    name: 'lastName',
                    refCount: 1,
                    value: undefined,
                    isContainer: false,
                    type: VariableType.Invalid,
                    isConst: false
                }]
            }]
        });

        response = VariablesResponse.fromBuffer(response.toBuffer());

        expect(response.success).to.be.true;

        expect(
            response.data
        ).to.eql({
            packetLength: 69, // 4  bytes
            errorCode: ErrorCode.OK, // 4 bytes
            requestId: 2, // 4 bytes
            // num_variables // 4 bytes
            variables: [{
                // flags // 1 byte
                name: 'person', // 7 bytes
                refCount: 2, // 4 bytes
                isConst: false, // 0 bytes -- part of flags
                isContainer: true, // 0 bytes -- part of flags
                type: VariableType.AssociativeArray, // 1 byte
                keyType: 'String', // 1 byte
                // element_count // 4 bytes
                children: [{
                    // flags // 1 byte
                    isContainer: false, // 0 bytes --part of flags
                    isConst: false, // 0 bytes -- part of flags
                    type: VariableType.String, // 1 byte
                    name: 'firstName', // 10 bytes
                    refCount: 1, // 4 bytes
                    value: 'Bob' // 4 bytes
                }, {
                    // flags // 1 byte
                    isContainer: false, // 0 bytes -- part of flags
                    isConst: false, // 0 bytes -- part of flags
                    type: VariableType.Invalid, // 1 byte
                    name: 'lastName', // 9 bytes
                    refCount: 1 // 4 bytes
                }]
            }]
        });
    });

    it('handles every variable type', () => {
        let response = VariablesResponse.fromBuffer(
            VariablesResponse.fromJson({
                requestId: 2,
                variables: [
                    v('a', VariableType.Interface, 'ifArray'),
                    v('b', VariableType.Object, 'SomeObj'),
                    v('c', VariableType.String, 'hello world'),
                    v('d', VariableType.Subroutine, 'main'),
                    v('e', VariableType.Function, 'test'),
                    v('f', VariableType.SubtypedObject, 'Parent; Child'),
                    v('gTrue', VariableType.Boolean, true),
                    v('gFalse', VariableType.Boolean, false),
                    v('h', VariableType.Integer, 987),
                    v('i1', VariableType.LongInteger, 123456789123),
                    v('i2', VariableType.LongInteger, BigInt(999999999999)),
                    // v('j', VariableType.Float, 1.987654), // handled in other test since this value is approximated
                    // v('k', VariableType.Float, 1.2345678912345) // handled in other test since this value is approximated
                    v('l', VariableType.Uninitialized, undefined),
                    v('m', VariableType.Unknown, undefined),
                    v('n', VariableType.Invalid, undefined),
                    v('o', VariableType.AssociativeArray, undefined),
                    v('p', VariableType.Array, undefined),
                    v('q', VariableType.List, undefined)
                ]
            }).toBuffer()
        );
        expect(
            response.data.variables.map(x => ({
                name: x.name,
                value: x.value,
                type: x.type
            }))
        ).to.eql(
            [
                ['a', VariableType.Interface, 'ifArray'],
                ['b', VariableType.Object, 'SomeObj'],
                ['c', VariableType.String, 'hello world'],
                ['d', VariableType.Subroutine, 'main'],
                ['e', VariableType.Function, 'test'],
                ['f', VariableType.SubtypedObject, 'Parent; Child'],
                ['gTrue', VariableType.Boolean, true],
                ['gFalse', VariableType.Boolean, false],
                ['h', VariableType.Integer, 987],
                ['i1', VariableType.LongInteger, BigInt(123456789123)],
                ['i2', VariableType.LongInteger, BigInt('999999999999')],
                // ['j', VariableType.Float, 1.987654], // handled in other test since this value is approximated
                // ['k', VariableType.Float, 1.2345678912345] // handled in other test since this value is approximated
                ['l', VariableType.Uninitialized, undefined],
                ['m', VariableType.Unknown, undefined],
                ['n', VariableType.Invalid, undefined],
                ['o', VariableType.AssociativeArray, undefined],
                ['p', VariableType.Array, undefined],
                ['q', VariableType.List, undefined]
            ].map(x => ({
                name: x.shift(),
                type: x.shift(),
                value: x.shift()
            }))
        );
    });

    it('handles float and double', () => {
        let response = VariablesResponse.fromBuffer(
            VariablesResponse.fromJson({
                requestId: 2,
                variables: [
                    v('j', VariableType.Float, 1.234567),
                    v('k', VariableType.Double, 9.87654321987654)
                ]
            }).toBuffer()
        );
        expect(response.data.variables[0].value).to.be.approximately(1.234567, 0.000001);
        expect(response.data.variables[1].value).to.be.approximately(9.87654321987654, 0.0000000001);
    });

    it('writes nothing for data that has no value', () => {
        const buffer = new SmartBuffer();
        VariablesResponse.prototype['writeVariableValue'](VariableType.Uninitialized, undefined, buffer);
        VariablesResponse.prototype['writeVariableValue'](VariableType.Unknown, undefined, buffer);
        VariablesResponse.prototype['writeVariableValue'](VariableType.Invalid, undefined, buffer);
        VariablesResponse.prototype['writeVariableValue'](VariableType.AssociativeArray, undefined, buffer);
        VariablesResponse.prototype['writeVariableValue'](VariableType.Array, undefined, buffer);
        VariablesResponse.prototype['writeVariableValue'](VariableType.List, undefined, buffer);
        expect(buffer.length).to.eql(0);
    });

    it('writeVariableValue throws for unknown variable value', () => {
        expectThrows(
            () => VariablesResponse.prototype['writeVariableValue']('NotRealVariableType' as any, undefined, new SmartBuffer()),
            'Unable to determine the variable value'
        );
    });

    it('writeVariableValue throws for incorrectly formatted SubtypedObject', () => {
        expectThrows(
            () => VariablesResponse.prototype['writeVariableValue'](VariableType.SubtypedObject, 'IShouldHaveASemicolonAndAnotherThingAfterThat', new SmartBuffer()),
            'Expected two names for subtyped object'
        );
    });

    it('writeVariableValue throws for undefined SubtypedObject', () => {
        expectThrows(
            () => VariablesResponse.prototype['writeVariableValue'](VariableType.SubtypedObject, undefined, new SmartBuffer()),
            'Expected two names for subtyped object'
        );
    });

    it('writeVariable determines if variable is const', () => {
        let response = VariablesResponse.fromBuffer(
            VariablesResponse.fromJson({
                requestId: 2,
                variables: [
                    v('alpha', VariableType.List, undefined, { isConst: true }),
                    v('beta', VariableType.List, undefined, { isConst: false })

                ]
            }).toBuffer()
        );
        expect(response.data.variables[0].isConst).to.be.true;
        expect(response.data.variables[1].isConst).to.be.false;
    });

    it('handles several root-level vars', () => {
        let response = VariablesResponse.fromJson({
            requestId: 2,
            variables: [{
                name: 'm',
                refCount: 2,
                isConst: false,
                isContainer: true,
                childCount: 3,
                type: VariableType.AssociativeArray,
                keyType: VariableType.String,
                value: undefined
            }, {
                name: 'nodes',
                refCount: 2,
                isConst: false,
                isContainer: true,
                childCount: 2,
                type: VariableType.Array,
                keyType: VariableType.Integer,
                value: undefined
            }, {
                name: 'message',
                refCount: 2,
                isConst: false,
                isContainer: false,
                type: VariableType.String,
                value: 'hello'
            }]
        });

        expect(response.data).to.eql({
            packetLength: undefined,
            errorCode: ErrorCode.OK,
            requestId: 2,
            variables: [{
                isConst: false,
                isContainer: true,
                type: VariableType.AssociativeArray,
                name: 'm',
                refCount: 2,
                keyType: VariableType.String,
                childCount: 3,
                value: undefined
            }, {
                isConst: false,
                isContainer: true,
                type: VariableType.Array,
                name: 'nodes',
                refCount: 2,
                keyType: VariableType.Integer,
                childCount: 2,
                value: undefined
            }, {
                isConst: false,
                isContainer: false,
                type: VariableType.String,
                name: 'message',
                refCount: 2,
                value: 'hello'
            }]
        });

        response = VariablesResponse.fromBuffer(response.toBuffer());

        expect(response.success).to.be.true;

        expect(
            response.data
        ).to.eql({
            packetLength: 66, // 4  bytes
            errorCode: ErrorCode.OK, // 4 bytes
            requestId: 2, // 4 bytes
            // num_variables // 4 bytes
            variables: [{
                // flags // 1 byte
                isConst: false, // 0 bytes -- part of flags
                isContainer: true, // 0 bytes -- part of flags
                type: VariableType.AssociativeArray, // 1 byte
                name: 'm', // 2 bytes
                refCount: 2, // 4 bytes
                keyType: VariableType.String, // 1 byte
                childCount: 3 // 4 bytes
            }, {
                // flags // 1 byte
                isConst: false, // 0 bytes -- part of flags
                isContainer: true, // 0 bytes -- part of flags
                type: VariableType.Array, // 1 byte
                name: 'nodes', // 6 bytes
                refCount: 2, // 4 bytes
                keyType: VariableType.Integer, // 1 byte
                childCount: 2 // 4 bytes
            }, {
                // flags // 1 byte
                isConst: false, // 0 bytes -- part of flags
                isContainer: false, // 0 bytes -- part of flags
                type: VariableType.String, // 1 byte
                name: 'message', // 8 bytes
                refCount: 2, // 4 bytes
                value: 'hello' // 6 bytes
            }]
        });
    });
});
