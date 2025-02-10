import { expect } from 'chai';
import type { Response } from 'request';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import type { AugmentedVariable } from './BrightScriptDebugSession';
import { BrightScriptDebugSession } from './BrightScriptDebugSession';
import { populateVariableFromRegistryEcp } from './ecpRegistryUtils';

describe('ecpRegistryUtils', () => {
    let session: BrightScriptDebugSession;

    beforeEach(() => {
        session = new BrightScriptDebugSession();
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
                await populateVariableFromRegistryEcp({
                    body: `
                        <plugin-registry>
                        <status>OK</status>
                        <error>Plugin dev not found</error>
                        </plugin-registry>
                    `,
                    statusCode: 200
                } as Response, v, session['variables'], refFactory);
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
                expect(session['variables']).to.eql({ 1: {
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
                } });
            });

            it('handles ok response with empty sections', async () => {
                let v: AugmentedVariable = {
                    variablesReference: 1,
                    name: 'Registry',
                    value: '',
                    type: '$$Registry',
                    childVariables: []
                };
                await populateVariableFromRegistryEcp({
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <plugin-registry>
                            <registry>
                                <dev-id>12345</dev-id>
                                <plugins>12,34,dev</plugins>
                                <space-available>28075</space-available>
                                <sections />
                            </registry>
                            <status>OK</status>
                        </plugin-registry>
                    `,
                    statusCode: 200
                } as Response, v, session['variables'], refFactory);
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
                await populateVariableFromRegistryEcp({
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <plugin-registry>
                            <registry>
                                <dev-id>12345</dev-id>
                                <plugins>dev</plugins>
                                <space-available>32590</space-available>
                                <sections>
                                    <section>
                                        <name>section One</name>
                                        <items>
                                            <item>
                                                <key>first key in section one</key>
                                                <value>value one section one</value>
                                            </item>
                                        </items>
                                    </section>
                                    <section>
                                        <name>section Two</name>
                                        <items>
                                            <item>
                                                <key>first key in section two</key>
                                                <value>value one section two</value>
                                            </item>
                                            <item>
                                                <key>second key in section two</key>
                                                <value>value two section two</value>
                                            </item>
                                        </items>
                                    </section>
                                </sections>
                            </registry>
                            <status>OK</status>
                        </plugin-registry>
                    `,
                    statusCode: 200
                } as Response, v, session['variables'], refFactory);
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
                await populateVariableFromRegistryEcp({
                    body: `
                        <plugin-registry>
                            <status>FAILED</status>
                            <error>Plugin dev not found</error>
                        </plugin-registry>
                    `,
                    statusCode: 200
                } as Response, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Plugin dev not found`,
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
                await populateVariableFromRegistryEcp({
                    body: `
                        <plugin-registry>
                            <status>FAILED</status>
                            <error>Device not keyed</error>
                        </plugin-registry>
                    `,
                    statusCode: 200
                } as Response, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Device not keyed`,
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
                await populateVariableFromRegistryEcp({
                    body: `
                        <plugin-registry>
                            <status>FAILED</status>
                        </plugin-registry>
                    `,
                    statusCode: 200
                } as Response, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: Unknown error`,
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
                await populateVariableFromRegistryEcp({
                    body: `ECP command not allowed in Limited mode.`,
                    statusCode: 403
                } as Response, v, session['variables'], refFactory);
                expect(v.childVariables.length).to.eql(1);
                expect(v.childVariables[0]).to.eql({
                    name: 'error',
                    value: `❌ Error: ECP command not allowed in Limited mode.`,
                    variablesReference: 0,
                    type: VariableType.String,
                    childVariables: []
                });
            });
        });
    });
});
