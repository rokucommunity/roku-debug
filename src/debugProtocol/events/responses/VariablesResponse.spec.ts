/* eslint-disable no-bitwise */
import { VariablesResponse, VariableType } from './VariablesResponse';
import { expect } from 'chai';
import { ErrorCode } from '../../Constants';

describe('VariablesResponse', () => {

    it('handles parent var with children', () => {
        let response = VariablesResponse.fromJson({
            requestId: 2,
            variables: [{
                name: 'person',
                refCount: 2,
                isConst: false,
                isContainer: true,
                type: VariableType.AA,
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
                type: VariableType.AA,
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
                type: VariableType.AA, // 1 byte
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

    it('handles several root-level vars', () => {
        let response = VariablesResponse.fromJson({
            requestId: 2,
            variables: [{
                name: 'm',
                refCount: 2,
                isConst: false,
                isContainer: true,
                childCount: 3,
                type: VariableType.AA,
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
                type: VariableType.AA,
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
                type: VariableType.AA, // 1 byte
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
