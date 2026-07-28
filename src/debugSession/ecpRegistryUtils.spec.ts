import { expect } from 'chai';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import type { AugmentedVariable } from './BrightScriptDebugSession';
import { BrightScriptDebugSession } from './BrightScriptDebugSession';
import { populateVariableFromRegistryEcp } from './ecpRegistryUtils';
import { rokuDeploy } from 'roku-deploy';
import { createSandbox } from 'sinon';

const sinon = createSandbox();

describe('ecpRegistryUtils', () => {
    let session: BrightScriptDebugSession;

    beforeEach(() => {
        session = new BrightScriptDebugSession();
        session['publishTimeout'] = 1_000;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('populateVariableFromRegistryEcp', () => {
        let refFactory = (key: string, frameId: number) => session['getEvaluateRefId'](key, frameId);

        describe('non-error responses', () => {
            beforeEach(() => {
                session['variables'] = {};
                session['evaluateRefIdCounter'] = 1;
            });

            afterEach(() => {
                session['variables'] = {};
                session['evaluateRefIdCounter'] = 1;
            });

            it('handles ok response with no other properties', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                sinon.stub(rokuDeploy, 'queryRegistry').resolves({
                    sections: {}
                });

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'sections',
                    namedVariables: 1,
                    type: VariableType.AssociativeArray,
                    value: VariableType.AssociativeArray,
                    variablesReference: 1,
                    childVariables: [{
                        name: '$count',
                        presentationHint: { kind: 'virtual' },
                        type: VariableType.Integer,
                        value: '0',
                        variablesReference: 0,
                        childVariables: []
                    }]
                });
                expect(session['variables']).to.eql({
                    1: {
                        name: 'sections',
                        namedVariables: 1,
                        type: VariableType.AssociativeArray,
                        value: VariableType.AssociativeArray,
                        variablesReference: 1,
                        childVariables: [{
                            name: '$count',
                            presentationHint: { kind: 'virtual' },
                            type: VariableType.Integer,
                            value: '0',
                            variablesReference: 0,
                            childVariables: []
                        }]
                    }
                });
            });

            it('handles ok response with empty sections', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                sinon.stub(rokuDeploy, 'queryRegistry').resolves({
                    devId: '12345',
                    plugins: ['12', '34', 'dev'],
                    spaceAvailable: '28075',
                    sections: {}
                });

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(4);
                expect(v.childVariables[0]).to.eql({
                    name: 'devId',
                    value: '"12345"',
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
                expect(v.childVariables[1]).to.eql({
                    name: 'plugins',
                    value: VariableType.Array + '(3)',
                    variablesReference: 1,
                    indexedVariables: 3,
                    namedVariables: 1,
                    type: VariableType.Array,
                    childVariables: [{
                        name: '0',
                        value: '"12"',
                        variablesReference: 0,
                        type: VariableType.String,
                        childVariables: []
                    }, {
                        name: '1',
                        value: '"34"',
                        variablesReference: 0,
                        type: VariableType.String,
                        childVariables: []
                    }, {
                        name: '2',
                        value: '"dev"',
                        variablesReference: 0,
                        type: VariableType.String,
                        childVariables: []
                    }, {
                        name: '$count',
                        presentationHint: { kind: 'virtual' },
                        type: VariableType.Integer,
                        value: '3',
                        variablesReference: 0,
                        childVariables: []
                    }]
                });
                expect(v.childVariables[2]).to.eql({
                    name: 'spaceAvailable',
                    value: '28075',
                    variablesReference: 0,
                    type: VariableType.Integer,
                    childVariables: []
                });
                expect(v.childVariables[3]).to.eql({
                    name: 'sections',
                    value: VariableType.AssociativeArray,
                    variablesReference: 2,
                    namedVariables: 1,
                    type: VariableType.AssociativeArray,
                    childVariables: [{
                        name: '$count',
                        value: '0',
                        presentationHint: { kind: 'virtual' },
                        type: VariableType.Integer,
                        variablesReference: 0,
                        childVariables: []
                    }]
                });
            });

            it('handles ok response with populated sections', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                sinon.stub(rokuDeploy, 'queryRegistry').resolves({
                    devId: '12345',
                    plugins: ['dev'],
                    spaceAvailable: '32590',
                    sections: {
                        'section One': {
                            'first key in section one': 'value one section one'
                        },
                        'section Two': {
                            'first key in section two': 'value one section two',
                            'second key in section two': 'value two section two'
                        }
                    }
                });

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(4);
                expect(v.childVariables[0]).to.eql({
                    name: 'devId',
                    value: '"12345"',
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
                expect(v.childVariables[1]).to.eql({
                    name: 'plugins',
                    value: VariableType.Array + '(1)',
                    variablesReference: 1,
                    indexedVariables: 1,
                    namedVariables: 1,
                    type: VariableType.Array,
                    childVariables: [{
                        name: '0',
                        value: '"dev"',
                        variablesReference: 0,
                        type: VariableType.String,
                        childVariables: []
                    }, {
                        name: '$count',
                        presentationHint: { kind: 'virtual' },
                        type: VariableType.Integer,
                        value: '1',
                        variablesReference: 0,
                        childVariables: []
                    }]
                });
                expect(v.childVariables[2]).to.eql({
                    name: 'spaceAvailable',
                    value: '32590',
                    variablesReference: 0,
                    type: VariableType.Integer,
                    childVariables: []
                });
                expect(v.childVariables[3]).to.eql({
                    name: 'sections',
                    value: VariableType.AssociativeArray,
                    variablesReference: 2,
                    namedVariables: 3,
                    type: VariableType.AssociativeArray,
                    childVariables: [{
                        name: 'section One',
                        value: VariableType.AssociativeArray,
                        variablesReference: 3,
                        namedVariables: 2,
                        type: VariableType.AssociativeArray,
                        childVariables: [{
                            name: 'first key in section one',
                            value: '"value one section one"',
                            evaluateName: 'createObject("roRegistrySection", "section One").Read("first key in section one")',
                            variablesReference: 0,
                            type: VariableType.String,
                            childVariables: []
                        }, {
                            name: '$count',
                            value: '1',
                            presentationHint: { kind: 'virtual' },
                            type: VariableType.Integer,
                            variablesReference: 0,
                            childVariables: []
                        }]
                    }, {
                        name: 'section Two',
                        value: VariableType.AssociativeArray,
                        variablesReference: 4,
                        namedVariables: 3,
                        type: VariableType.AssociativeArray,
                        childVariables: [{
                            name: 'first key in section two',
                            value: '"value one section two"',
                            evaluateName: 'createObject("roRegistrySection", "section Two").Read("first key in section two")',
                            variablesReference: 0,
                            type: VariableType.String,
                            childVariables: []
                        }, {
                            name: 'second key in section two',
                            value: '"value two section two"',
                            evaluateName: 'createObject("roRegistrySection", "section Two").Read("second key in section two")',
                            variablesReference: 0,
                            type: VariableType.String,
                            childVariables: []
                        }, {
                            name: '$count',
                            value: '2',
                            presentationHint: { kind: 'virtual' },
                            type: VariableType.Integer,
                            variablesReference: 0,
                            childVariables: []
                        }]
                    }, {
                        name: '$count',
                        value: '2',
                        presentationHint: { kind: 'virtual' },
                        type: VariableType.Integer,
                        variablesReference: 0,
                        childVariables: []
                    }]
                });
            });
        });

        describe('error responses', () => {
            beforeEach(() => {
                session['variables'] = {};
                session['evaluateRefIdCounter'] = 1;
            });

            afterEach(() => {
                session['variables'] = {};
                session['evaluateRefIdCounter'] = 1;
            });

            it('handles not in dev mode', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                sinon.stub(rokuDeploy, 'queryRegistry').rejects(new Error('Could not retrieve registry: Plugin dev not found'));

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Could not retrieve registry: Plugin dev not found`,
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
            });

            it('handles device not keyed', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                sinon.stub(rokuDeploy, 'queryRegistry').rejects(new Error('Could not retrieve registry: Device not keyed'));

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Could not retrieve registry: Device not keyed`,
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
            });

            it('handles failed status with missing error', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                sinon.stub(rokuDeploy, 'queryRegistry').rejects(new Error('Could not retrieve registry: Unknown error'));

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Could not retrieve registry: Unknown error`,
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
            });

            it('handles error response without xml', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };

                //roku-deploy throws an UnparsableDeviceResponseError carrying the device's
                //plain-text explanation when the response body is not xml (a limited-mode refusal,
                //for example), so that text still reaches the variables pane
                sinon.stub(rokuDeploy, 'queryRegistry').rejects(new Error('Could not retrieve registry: ECP command not allowed in Limited mode.'));

                await populateVariableFromRegistryEcp({ host: '', appId: '' }, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Could not retrieve registry: ECP command not allowed in Limited mode.`,
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
            });
        });
    });
});
