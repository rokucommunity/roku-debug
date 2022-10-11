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
    });
});
