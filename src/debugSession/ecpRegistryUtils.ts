import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';
import { util } from '../util';
import { rokuECP } from '../RokuECP';
import type { RokuEcpParam } from '../RokuECP';
import type { AugmentedVariable } from './BrightScriptDebugSession';
import type { Response } from 'request';

export async function populateVariableFromRegistryEcp(options: RokuEcpParam<'getRegistry'>, v: AugmentedVariable, variables: Record<number, AugmentedVariable>, refIdFactory: (key: string, frameId: number) => number) {
    let registryData = await rokuECP.getRegistry(options);

    if (registryData.status === 'OK') {
        // Add registry data to variable list
        if (registryData.devId) {
            v.childVariables.push(<AugmentedVariable>{
                name: 'devId',
                value: `"${registryData.devId}"`,
                type: VariableType.String,
                variablesReference: 0,
                childVariables: []
            });
        }

        if (registryData.plugins) {
            let refId = refIdFactory('$$registry.plugins', Infinity);
            let pluginsVariable = <AugmentedVariable>{
                name: 'plugins',
                value: VariableType.Array + `(${registryData.plugins.length})`,
                type: VariableType.Array,
                indexedVariables: registryData.plugins.length,
                namedVariables: 1,
                variablesReference: refId,
                childVariables: [<AugmentedVariable>{
                    name: '$count',
                    value: registryData.plugins.length.toString(),
                    type: VariableType.Integer,
                    presentationHint: { kind: 'virtual' },
                    variablesReference: 0,
                    childVariables: []
                }]
            };
            v.childVariables.push(pluginsVariable);
            variables[refId] = pluginsVariable;
            pluginsVariable.childVariables.splice(0, 0, ...registryData.plugins.map((id, index) => {
                return <AugmentedVariable>{
                    name: index.toString(),
                    value: `"${id}"`,
                    type: VariableType.String,
                    variablesReference: 0,
                    childVariables: []
                };
            }));
        }

        if (registryData.spaceAvailable) {
            v.childVariables.push(<AugmentedVariable>{
                name: 'spaceAvailable',
                value: registryData.spaceAvailable,
                type: VariableType.Integer,
                variablesReference: 0,
                childVariables: []
            });
        }

        if (registryData.sections) {
            let refId = refIdFactory('$$registry.sections', Infinity);
            let sections = Object.entries(registryData.sections);
            let sectionsVariable = <AugmentedVariable>{
                name: 'sections',
                value: VariableType.AssociativeArray,
                type: VariableType.AssociativeArray,
                namedVariables: sections.length + 1,
                variablesReference: refId,
                childVariables: [<AugmentedVariable>{
                    name: '$count',
                    value: sections.length.toString(),
                    type: VariableType.Integer,
                    presentationHint: { kind: 'virtual' },
                    variablesReference: 0,
                    childVariables: []
                }]
            };
            v.childVariables.push(sectionsVariable);
            variables[refId] = sectionsVariable;
            sectionsVariable.childVariables.splice(0, 0, ...sections.map((entry) => {
                let sectionName = entry[0];
                let items = Object.entries(entry[1]);
                let refId = refIdFactory(`$$registry.sections.${sectionName}`, Infinity);
                let sectionItemVariable = <AugmentedVariable>{
                    name: sectionName,
                    value: VariableType.AssociativeArray,
                    type: VariableType.AssociativeArray,
                    variablesReference: refId,
                    namedVariables: items.length + 1,
                    childVariables: [<AugmentedVariable>{
                        name: '$count',
                        value: items.length.toString(),
                        type: VariableType.Integer,
                        presentationHint: { kind: 'virtual' },
                        variablesReference: 0,
                        childVariables: []
                    }]
                };
                variables[refId] = sectionItemVariable;

                sectionItemVariable.childVariables.splice(0, 0, ...items.map((item) => {
                    let [itemName, itemValue] = item;
                    return <AugmentedVariable>{
                        evaluateName: `createObject("roRegistrySection", "${sectionName}").Read("${itemName}")`,
                        name: itemName,
                        value: `"${itemValue}"`,
                        type: VariableType.String,
                        variablesReference: 0,
                        childVariables: []
                    };
                }));
                return sectionItemVariable;
            }));
        }
    } else {
        v.childVariables.push(<AugmentedVariable>{
            name: 'error',
            value: `❌ Error: ${registryData.errorMessage ?? 'Unknown error'}`,
            type: VariableType.String,
            variablesReference: 0,
            childVariables: []
        });
    }
}

export interface EcpRegistryData {
    devId?: string;
    plugins?: Array<string>;
    sections?: Record<string, Record<string, string>>;
    spaceAvailable?: string;
    status: 'OK' | 'FAILED';
    errorMessage?: string;
}

interface RegistryAsJson {
    'plugin-registry': {
        registry: [{
            'dev-id': [string];
            plugins: [string];
            sections: [{
                section: [{
                    items: [{
                        item: [{
                            key: [string];
                            value: [string];
                        }];
                    }];
                    name: [string];
                } | string];
            }];
            'space-available': [string];
        }];
        status: [string];
        error?: [string];
    };
}
