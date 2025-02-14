import * as assert from 'assert';
import { expect } from 'chai';
import * as fsExtra from 'fs-extra';
import * as getPort from 'get-port';
import * as net from 'net';
import * as path from 'path';
import type { BSDebugDiagnostic } from './CompileErrorProcessor';
import * as dedent from 'dedent';
import { util } from './util';
import { util as bscUtil } from 'brighterscript';
import { createSandbox } from 'sinon';
import { describe } from 'mocha';
import { get } from 'request';
import type { EcpRegistryData } from './RokuECP';
import { rokuECP } from './RokuECP';
const sinon = createSandbox();

beforeEach(() => {
    sinon.restore();
});

describe('RokuECP', () => {

    describe('getRegistry', () => {
        it('calls doRequest with correct route and options', async () => {
            let options = {
                host: '1.1.1.1',
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuECP as any, 'doRequest').resolves({
                body: '',
                statusCode: 200
            });

            await rokuECP.getRegistry(options);
            expect(stub.getCall(0).args).to.eql(['query/registry/dev', options]);
        });

    });

    describe('parseRegistry', () => {
        describe('non-error responses', () => {
            it('handles ok response with no other properties', async () => {
                let response = {
                    body: `
                        <plugin-registry>
                        <status>OK</status>
                        <error>Plugin dev not found</error>
                        </plugin-registry>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    devId: undefined,
                    plugins: undefined,
                    spaceAvailable: undefined,
                    sections: {},
                    status: 'OK'
                } as EcpRegistryData);
            });

            it('handles ok response with empty sections', async () => {
                let response = {
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
                };

                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    devId: '12345',
                    plugins: ['12', '34', 'dev'],
                    spaceAvailable: '28075',
                    sections: {},
                    status: 'OK'
                } as EcpRegistryData);
            });

            it('handles ok response with populated sections', async () => {
                let response = {
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
                    `
                };
                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    devId: '12345',
                    plugins: ['dev'],
                    sections: {
                        'section One': {
                            'first key in section one': 'value one section one'
                        },
                        'section Two': {
                            'first key in section two': 'value one section two',
                            'second key in section two': 'value two section two'
                        }
                    },
                    spaceAvailable: '32590',
                    status: 'OK'
                } as EcpRegistryData);
            });
        });

        describe('error responses', () => {
            it('handles not in dev mode', async () => {
                let response = {
                    body: `
                        <plugin-registry>
                            <status>FAILED</status>
                            <error>Plugin dev not found</error>
                        </plugin-registry>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    status: 'FAILED',
                    errorMessage: 'Plugin dev not found'
                } as EcpRegistryData);
            });

            it('handles device not keyed', async () => {
                let response = {
                    body: `
                        <plugin-registry>
                            <status>FAILED</status>
                            <error>Device not keyed</error>
                        </plugin-registry>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    status: 'FAILED',
                    errorMessage: 'Device not keyed'
                } as EcpRegistryData);
            });

            it('handles failed status with missing error', async () => {
                let response = {
                    body: `
                        <plugin-registry>
                            <status>FAILED</status>
                        </plugin-registry>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    status: 'FAILED',
                    errorMessage: 'Unknown error'
                } as EcpRegistryData);
            });

            it('handles error response without xml', async () => {
                let response = {
                    body: `ECP command not allowed in Limited mode.`,
                    statusCode: 403
                };
                let result = await rokuECP['processRegistry'](response as any);
                expect(result).to.eql({
                    status: 'FAILED',
                    errorMessage: 'ECP command not allowed in Limited mode.'
                } as EcpRegistryData);
            });
        });
    });
});
