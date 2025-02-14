import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { describe } from 'mocha';
import type { EcpAppStateData, EcpRegistryData } from './RokuECP';
import { AppState, EcpStatus, rokuECP } from './RokuECP';
import { util } from './util';
import { expectThrowsAsync } from './testHelpers.spec';

const sinon = createSandbox();


describe.only('RokuECP', () => {

    beforeEach(() => {
        sinon.restore();
    });

    describe('doRequest', () => {
        it('correctly builds url without leading /', async () => {
            let options = {
                host: '1.1.1.1',
                remotePort: 8080
            };

            let stub = sinon.stub(util as any, 'httpGet').resolves({
                body: '',
                statusCode: 200
            });

            await rokuECP['doRequest']('query/my-route', options);
            expect(stub.getCall(0).args).to.eql([`http://1.1.1.1:8080/query/my-route`, undefined]);
        });

        it('correctly builds url with leading /', async () => {
            let options = {
                host: '1.1.1.1',
                remotePort: 8080
            };

            let stub = sinon.stub(util as any, 'httpGet').resolves({
                body: '',
                statusCode: 200
            });

            await rokuECP['doRequest']('/query/my-route', options);
            expect(stub.getCall(0).args).to.eql([`http://1.1.1.1:8080/query/my-route`, undefined]);
        });

        it('passes request options if populated', async () => {
            let options = {
                host: '1.1.1.1',
                remotePort: 8080,
                requestOptions: {
                    timeout: 1000
                }
            };

            let stub = sinon.stub(util as any, 'httpGet').resolves({
                body: '',
                statusCode: 200
            });

            await rokuECP['doRequest']('/query/my-route', options);
            expect(stub.getCall(0).args).to.eql([`http://1.1.1.1:8080/query/my-route`, options.requestOptions]);
        });

        it('uses default port 8060 when missing in options', async () => {
            let options = {
                host: '1.1.1.1'
            };

            let stub = sinon.stub(util as any, 'httpGet').resolves({
                body: '',
                statusCode: 200
            });

            await rokuECP['doRequest']('/query/my-route', options);
            expect(stub.getCall(0).args).to.eql([`http://1.1.1.1:8060/query/my-route`, undefined]);
        });
    });

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
            sinon.stub(rokuECP as any, 'processRegistry').resolves({});

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
                    status: EcpStatus.ok
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
                    status: EcpStatus.ok
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
                    status: EcpStatus.ok
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
                await expectThrowsAsync(() => rokuECP['processRegistry'](response as any), 'Plugin dev not found');
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
                await expectThrowsAsync(() => rokuECP['processRegistry'](response as any), 'Device not keyed');
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
                await expectThrowsAsync(() => rokuECP['processRegistry'](response as any), 'Unknown error');
            });

            it('handles error response without xml', async () => {
                let response = {
                    body: `ECP command not allowed in Limited mode.`,
                    statusCode: 403
                };
                await expectThrowsAsync(() => rokuECP['processRegistry'](response as any), 'ECP command not allowed in Limited mode.');
            });
        });
    });

    describe('getAppState', () => {
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

            sinon.stub(rokuECP as any, 'processAppState').resolves({});

            await rokuECP.getAppState(options);
            expect(stub.getCall(0).args).to.eql(['query/app-status/dev', options]);
        });
    });

    describe('processAppState', () => {
        describe('non-error responses', () => {
            it('handles ok response', async () => {
                let response = {
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <app-state>
                            <app-id>dev</app-id>
                            <app-title>my app</app-title>
                            <app-version>10.0.0</app-version>
                            <app-dev-id>12345</app-dev-id>
                            <state>active</state>
                            <status>OK</status>
                        </app-state>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processAppState'](response as any);
                expect(result).to.eql({
                    appId: 'dev',
                    appDevId: '12345',
                    appTitle: 'my app',
                    appVersion: '10.0.0',
                    state: AppState.active,
                    status: EcpStatus.ok
                } as EcpAppStateData);
            });

            it('handles ok response with unknown state', async () => {
                let response = {
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <app-state>
                            <app-id>dev</app-id>
                            <app-title>my app</app-title>
                            <app-version>10.0.0</app-version>
                            <app-dev-id>12345</app-dev-id>
                            <state>bad</state>
                            <status>OK</status>
                        </app-state>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processAppState'](response as any);
                expect(result).to.eql({
                    appId: 'dev',
                    appDevId: '12345',
                    appTitle: 'my app',
                    appVersion: '10.0.0',
                    state: AppState.unknown,
                    status: EcpStatus.ok
                } as EcpAppStateData);
            });

            it('handles ok response with uppercase state', async () => {
                let response = {
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <app-state>
                            <app-id>dev</app-id>
                            <app-title>my app</app-title>
                            <app-version>10.0.0</app-version>
                            <app-dev-id>12345</app-dev-id>
                            <state>ACTIVE</state>
                            <status>OK</status>
                        </app-state>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processAppState'](response as any);
                expect(result).to.eql({
                    appId: 'dev',
                    appDevId: '12345',
                    appTitle: 'my app',
                    appVersion: '10.0.0',
                    state: AppState.active,
                    status: EcpStatus.ok
                } as EcpAppStateData);
            });
        });

        describe('error responses', () => {
            it('handles failed status with missing error', async () => {
                let response = {
                    body: `
                        <app-state>
                            <status>FAILED</status>
                        </app-state>
                    `,
                    statusCode: 200
                };
                await expectThrowsAsync(() => rokuECP['processAppState'](response as any), 'Unknown error');
            });

            it('handles failed status with populated error', async () => {
                let response = {
                    body: `
                        <app-state>
                            <status>FAILED</status>
                            <error>App not found</error>
                        </app-state>
                    `,
                    statusCode: 200
                };
                await expectThrowsAsync(() => rokuECP['processAppState'](response as any), 'App not found');
            });

            it('handles error response without xml', async () => {
                let response = {
                    body: `ECP command not allowed in Limited mode.`,
                    statusCode: 403
                };
                await expectThrowsAsync(() => rokuECP['processAppState'](response as any), 'ECP command not allowed in Limited mode.');
            });
        });
    });

    describe('exitApp', () => {
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
            sinon.stub(rokuECP as any, 'processExitApp').resolves({});

            await rokuECP.exitApp(options);
            expect(stub.getCall(0).args).to.eql(['exit-app/dev', options]);
        });
    });

    describe('processExitApp', () => {
        describe('non-error responses', () => {
            it('handles ok response', async () => {
                let response = {
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <exit-app>
                            <status>OK</status>
                        </exit-app>
                    `,
                    statusCode: 200
                };
                let result = await rokuECP['processExitApp'](response as any);
                expect(result).to.eql({
                    status: EcpStatus.ok
                });
            });
        });

        describe('error responses', () => {
            it('handles failed status with missing error', async () => {
                let response = {
                    body: `
                        <exit-app>
                            <status>FAILED</status>
                        </exit-app>
                    `,
                    statusCode: 200
                };
                await expectThrowsAsync(() => rokuECP['processExitApp'](response as any), 'Unknown error');
            });

            it('handles failed status with populated error', async () => {
                let response = {
                    body: `
                        <exit-app>
                            <status>FAILED</status>
                            <error>App not found</error>
                        </exit-app>
                    `,
                    statusCode: 200
                };
                await expectThrowsAsync(() => rokuECP['processExitApp'](response as any), 'App not found');
            });

            it('handles error response without xml', async () => {
                let response = {
                    body: `ECP command not allowed in Limited mode.`,
                    statusCode: 403
                };
                await expectThrowsAsync(() => rokuECP['processExitApp'](response as any), 'ECP command not allowed in Limited mode.');
            });
        });
    });
});
