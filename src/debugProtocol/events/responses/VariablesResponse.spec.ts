/* eslint-disable no-bitwise */
import { VariablesResponse, VariableType } from './VariablesResponse';
import { expect } from 'chai';
import { ErrorCode } from '../../Constants';

describe('VariablesResponse', () => {

    it.only('Properly parses invalid variable', () => {
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
            packetLength: undefined, // 4  bytes
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
                    name: 'firstName', // 10 bytes
                    refCount: 1, // 4 bytes
                    value: 'Bob', // 4 bytes
                    type: VariableType.String, // 1 byte
                    isContainer: false, // 0 bytes --part of flags
                    isConst: false // 0 bytes -- part of flags
                }, {
                    // flags // 1 byte
                    name: 'lastName', // 9 bytes
                    refCount: 1, // 4 bytes
                    type: VariableType.Invalid, // 1 byte
                    isContainer: false, // 0 bytes -- part of flags
                    isConst: false // 0 bytes -- part of flags
                }]
            }]
        });
    });
});
