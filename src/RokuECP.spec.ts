import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { describe } from 'mocha';
import type { EcpAppStateData, EcpHeapSnapshotData, EcpRegistryData } from './RokuECP';
import { AppState, EcpStatus, rokuECP } from './RokuECP';
import { expectThrowsAsync } from './testHelpers.spec';
import { undent } from 'undent';
import { rokuDeploy } from 'roku-deploy';
import type { RokuAppState, RokuRegistry } from 'roku-deploy';

const sinon = createSandbox();


describe('RokuECP', () => {

    beforeEach(() => {
        sinon.restore();
    });

    describe('doRequest', () => {
        it('routes the request through rokuDeploy.ecp as a GET by default', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080
            };

            let stub = sinon.stub(rokuDeploy, 'ecp').resolves({
                status: 200,
                body: '',
                json: undefined
            });

            await rokuECP['doRequest']('query/my-route', options);
            expect(stub.getCall(0).args).to.eql([
                { host: '1.1.1.1' },
                'query/my-route',
                { method: 'GET', ecpPort: 8080, timeout: undefined }
            ]);
            expect(stub.getCall(0).args[0]).to.equal(options.device);
        });

        it('maps post to POST and passes the requestOptions timeout', async () => {
            let options = {
                device: { instanceUrl: 'https://device.rce.roku.com/instance/my-instance', rceToken: 'my-rce-token' },
                requestOptions: {
                    timeout: 1000
                }
            };

            let stub = sinon.stub(rokuDeploy, 'ecp').resolves({
                status: 200,
                body: '',
                json: undefined
            });

            await rokuECP['doRequest']('/query/my-route', options, 'post');
            expect(stub.getCall(0).args).to.eql([
                options.device,
                '/query/my-route',
                { method: 'POST', ecpPort: undefined, timeout: 1000 }
            ]);
        });
    });

    describe('getRegistry', () => {
        const registryResult: RokuRegistry = {
            devId: '12345',
            plugins: ['dev'],
            spaceAvailable: '32590',
            sections: {}
        };

        it('calls rokuDeploy.queryRegistry with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'queryRegistry').resolves(registryResult);

            let result = await rokuECP.getRegistry(options);
            expect(stub.getCall(0).args).to.eql([{
                device: { host: '1.1.1.1' },
                appId: 'dev',
                ecpPort: 8080
            }]);
            expect(result).to.eql({
                devId: '12345',
                plugins: ['dev'],
                sections: {},
                spaceAvailable: '32590',
                status: EcpStatus.ok
            } as EcpRegistryData);
        });

        it('passes a local device config through to roku-deploy', async () => {
            let options = {
                remotePort: 8080,
                device: { host: '1.1.1.1' },
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'queryRegistry').resolves(registryResult);

            await rokuECP.getRegistry(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: 8080
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('passes an RCE device config through to roku-deploy', async () => {
            let options = {
                device: { instanceUrl: 'https://device.rce.roku.com/instance/my-instance', rceToken: 'my-rce-token' },
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'queryRegistry').resolves(registryResult);

            await rokuECP.getRegistry(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('maps a populated roku-deploy result onto EcpRegistryData', async () => {
            sinon.stub(rokuDeploy, 'queryRegistry').resolves({
                devId: '12345',
                plugins: ['12', '34', 'dev'],
                spaceAvailable: '28075',
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

            let result = await rokuECP.getRegistry({ device: { host: '1.1.1.1' }, appId: 'dev' });
            expect(result).to.eql({
                devId: '12345',
                plugins: ['12', '34', 'dev'],
                spaceAvailable: '28075',
                sections: {
                    'section One': {
                        'first key in section one': 'value one section one'
                    },
                    'section Two': {
                        'first key in section two': 'value one section two',
                        'second key in section two': 'value two section two'
                    }
                },
                status: EcpStatus.ok
            } as EcpRegistryData);
        });

        it('maps a minimal roku-deploy result onto EcpRegistryData', async () => {
            sinon.stub(rokuDeploy, 'queryRegistry').resolves({
                sections: {}
            });

            let result = await rokuECP.getRegistry({ device: { host: '1.1.1.1' }, appId: 'dev' });
            expect(result).to.eql({
                devId: undefined,
                plugins: undefined,
                spaceAvailable: undefined,
                sections: {},
                status: EcpStatus.ok
            } as EcpRegistryData);
        });

        it('propagates errors from roku-deploy', async () => {
            sinon.stub(rokuDeploy, 'queryRegistry').rejects(new Error('Could not retrieve registry: Device not keyed'));

            await expectThrowsAsync(() => rokuECP.getRegistry({ device: { host: '1.1.1.1' }, appId: 'dev' }), 'Could not retrieve registry: Device not keyed');
        });
    });

    describe('getAppState', () => {
        const appStateResult: RokuAppState = {
            appId: 'dev',
            appDevId: '12345',
            appTitle: 'my app',
            appVersion: '10.0.0',
            state: 'active'
        };

        it('calls rokuDeploy.queryAppState with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'queryAppState').resolves(appStateResult);

            let result = await rokuECP.getAppState(options);
            expect(stub.getCall(0).args).to.eql([{
                device: { host: '1.1.1.1' },
                appId: 'dev',
                ecpPort: 8080
            }]);
            expect(result).to.eql({
                appId: 'dev',
                appDevId: '12345',
                appTitle: 'my app',
                appVersion: '10.0.0',
                state: AppState.active,
                status: EcpStatus.ok
            } as EcpAppStateData);
        });

        it('passes an RCE device config through to roku-deploy', async () => {
            let options = {
                device: { instanceUrl: 'https://device.rce.roku.com/instance/my-instance', rceToken: 'my-rce-token' },
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'queryAppState').resolves(appStateResult);

            await rokuECP.getAppState(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('maps an unknown state onto AppState.unknown', async () => {
            sinon.stub(rokuDeploy, 'queryAppState').resolves({
                ...appStateResult,
                state: 'unknown'
            });

            let result = await rokuECP.getAppState({ device: { host: '1.1.1.1' }, appId: 'dev' });
            expect(result).to.eql({
                appId: 'dev',
                appDevId: '12345',
                appTitle: 'my app',
                appVersion: '10.0.0',
                state: AppState.unknown,
                status: EcpStatus.ok
            } as EcpAppStateData);
        });

        it('propagates errors from roku-deploy', async () => {
            sinon.stub(rokuDeploy, 'queryAppState').rejects(new Error('Could not retrieve app state: App not found'));

            await expectThrowsAsync(() => rokuECP.getAppState({ device: { host: '1.1.1.1' }, appId: 'dev' }), 'Could not retrieve app state: App not found');
        });
    });

    describe('exitApp', () => {
        it('calls rokuDeploy.exitApp with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'exitApp').resolves();

            let result = await rokuECP.exitApp(options);
            expect(stub.getCall(0).args).to.eql([{
                device: { host: '1.1.1.1' },
                appId: 'dev',
                ecpPort: 8080
            }]);
            expect(result).to.eql({
                status: EcpStatus.ok
            });
        });

        it('passes an RCE device config through to roku-deploy', async () => {
            let options = {
                device: { instanceUrl: 'https://device.rce.roku.com/instance/my-instance', rceToken: 'my-rce-token' },
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'exitApp').resolves();

            let result = await rokuECP.exitApp(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
            expect(result).to.eql({
                status: EcpStatus.ok
            });
        });

        it('propagates errors from roku-deploy', async () => {
            sinon.stub(rokuDeploy, 'exitApp').rejects(new Error('Could not exit app: App not found'));

            await expectThrowsAsync(() => rokuECP.exitApp({ device: { host: '1.1.1.1' }, appId: 'dev' }), 'Could not exit app: App not found');
        });
    });

    describe('captureHeapSnapshot', () => {
        it('calls doRequest with correct route and options', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                channelId: 'dev'
            };

            let stub = sinon.stub(rokuECP as any, 'doRequest').resolves({
                body: `
                    <?xml version="1.0" encoding="UTF-8" ?>
                    <perfetto-heapgraph-trigger>
                        <timestamp>1772434731151</timestamp>
                        <timestamp-end>1772434731188</timestamp-end>
                        <status>OK</status>
                    </perfetto-heapgraph-trigger>
                `,
                statusCode: 200
            });

            await rokuECP.captureHeapSnapshot(options);
            expect(stub.getCall(0).args).to.eql(['/perfetto/heapgraph/trigger/dev', options, 'post']);
        });

        describe('non-error responses', () => {
            it('handles ok response with timestamps', async () => {
                sinon.stub(rokuECP as any, 'doRequest').resolves({
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <perfetto-heapgraph-trigger>
                            <timestamp>1772434731151</timestamp>
                            <timestamp-end>1772434731188</timestamp-end>
                            <status>OK</status>
                        </perfetto-heapgraph-trigger>
                    `,
                    statusCode: 200
                });
                let result = await rokuECP.captureHeapSnapshot({ device: { host: '1.1.1.1' }, channelId: 'dev' });
                expect(result).to.eql({
                    timestamp: 1772434731151,
                    timestampEnd: 1772434731188,
                    status: EcpStatus.ok
                } as EcpHeapSnapshotData);
            });
        });

        describe('error responses', () => {
            it('handles failed status with error message', async () => {
                sinon.stub(rokuECP as any, 'doRequest').resolves({
                    body: `
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <perfetto-heapgraph-trigger>
                            <status>FAILED</status>
                            <error>Channel 'dev' not running, cannot fetch heap graph</error>
                        </perfetto-heapgraph-trigger>
                    `,
                    statusCode: 200
                });
                await expectThrowsAsync(() => rokuECP.captureHeapSnapshot({ device: { host: '1.1.1.1' }, channelId: 'dev' }), `Channel 'dev' not running, cannot fetch heap graph`);
            });

            it('handles failed status with missing error', async () => {
                sinon.stub(rokuECP as any, 'doRequest').resolves({
                    body: undent`
                        <?xml version="1.0" encoding="UTF-8" ?>
                        <perfetto-heapgraph-trigger>
                            <status>FAILED</status>
                        </perfetto-heapgraph-trigger>
                    `,
                    statusCode: 200
                });
                await expectThrowsAsync(() => rokuECP.captureHeapSnapshot({ device: { host: '1.1.1.1' }, channelId: 'dev' }), 'Unknown error');
            });

            it('handles error response without xml', async () => {
                sinon.stub(rokuECP as any, 'doRequest').resolves({
                    body: `ECP command not allowed in Limited mode.`,
                    statusCode: 403
                });
                await expectThrowsAsync(() => rokuECP.captureHeapSnapshot({ device: { host: '1.1.1.1' }, channelId: 'dev' }), 'ECP command not allowed in Limited mode.');
            });
        });
    });

});
