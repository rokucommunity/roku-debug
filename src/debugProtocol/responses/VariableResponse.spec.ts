/* eslint-disable no-bitwise */
import { VariableResponse } from './VariableResponse';
import { createVariableResponse } from './responseCreationHelpers.spec';
import { expect } from 'chai';
import { ERROR_CODES, VARIABLE_FLAGS, VARIABLE_TYPES } from '../Constants';

describe('VariableResponse', () => {

    it('Properly parses invalid variable', () => {
        let buffer = createVariableResponse({
            requestId: 2,
            errorCode: ERROR_CODES.OK,
            variables: [{
                name: 'person',
                refCount: 2,
                isConst: false,
                variableType: VARIABLE_TYPES.AA,
                keyType: VARIABLE_TYPES.String,
                value: undefined,
                children: [{
                    name: 'firstName',
                    refCount: 1,
                    value: 'Bob',
                    variableType: VARIABLE_TYPES.String,
                    isConst: false
                }, {
                    name: 'lastName',
                    refCount: 1,
                    value: undefined,
                    variableType: VARIABLE_TYPES.Invalid,
                    isConst: false
                }]
            }],
            includePacketLength: false
        });

        let response = new VariableResponse(buffer.toBuffer());
        expect(
            response.variables?.map(x => ({
                name: x.name,
                value: x.value,
                isContainer: x.isContainer
            }))
        ).to.eql([{
            name: 'person',
            value: null,
            isContainer: true
        }, {
            name: 'firstName',
            value: 'Bob',
            isContainer: false
        }, {
            name: 'lastName',
            value: 'Invalid',
            isContainer: false
        }]);
    });
});
