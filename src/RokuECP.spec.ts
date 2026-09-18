import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { describe } from 'mocha';
import type { EcpAppStateData, EcpHeapSnapshotData, EcpPerfettoEnableData, EcpRegistryData } from './RokuECP';
import { AppState, EcpStatus, rokuECP } from './RokuECP';
import { expectThrowsAsync } from './testHelpers.spec';
import { rokuDeploy } from 'roku-deploy';
import type { RokuAppState, RokuHeapSnapshotTrigger, RokuPerfettoTracing, RokuRegistry } from 'roku-deploy';

const sinon = createSandbox();


describe('RokuECP', () => {

    beforeEach(() => {
        sinon.restore();
    });

    describe('getRegistry', () => {
        const registryResult: RokuRegistry = {
            devId: '12345',
            plugins: ['dev'],
            spaceAvailable: '32590',
            sections: {}
        };

        it('calls rokuDeploy.getRegistry with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'getRegistry').resolves(registryResult);

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

            let stub = sinon.stub(rokuDeploy, 'getRegistry').resolves(registryResult);

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

            let stub = sinon.stub(rokuDeploy, 'getRegistry').resolves(registryResult);

            await rokuECP.getRegistry(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('maps a populated roku-deploy result onto EcpRegistryData', async () => {
            sinon.stub(rokuDeploy, 'getRegistry').resolves({
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
            sinon.stub(rokuDeploy, 'getRegistry').resolves({
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
            sinon.stub(rokuDeploy, 'getRegistry').rejects(new Error('Could not retrieve registry: Device not keyed'));

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

        it('calls rokuDeploy.getAppState with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'getAppState').resolves(appStateResult);

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

            let stub = sinon.stub(rokuDeploy, 'getAppState').resolves(appStateResult);

            await rokuECP.getAppState(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('maps an unknown state onto AppState.unknown', async () => {
            sinon.stub(rokuDeploy, 'getAppState').resolves({
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
            sinon.stub(rokuDeploy, 'getAppState').rejects(new Error('Could not retrieve app state: App not found'));

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

    describe('enablePerfettoTracing', () => {
        const perfettoTracingResult: RokuPerfettoTracing = {
            enabledChannels: ['dev'],
            applicationAlreadyStarted: false,
            timestamp: 1772434731151,
            timestampEnd: 1772434731188
        };

        it('calls rokuDeploy.enablePerfettoTracing with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'enablePerfettoTracing').resolves(perfettoTracingResult);

            let result = await rokuECP.enablePerfettoTracing(options);
            expect(stub.getCall(0).args).to.eql([{
                device: { host: '1.1.1.1' },
                appId: 'dev',
                ecpPort: 8080
            }]);
            expect(result).to.eql({
                enabledChannels: ['dev'],
                timestamp: 1772434731151,
                timestampEnd: 1772434731188,
                status: EcpStatus.ok
            } as EcpPerfettoEnableData);
        });

        it('passes an RCE device config through to roku-deploy', async () => {
            let options = {
                device: { instanceUrl: 'https://device.rce.roku.com/instance/my-instance', rceToken: 'my-rce-token' },
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'enablePerfettoTracing').resolves(perfettoTracingResult);

            await rokuECP.enablePerfettoTracing(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('propagates errors from roku-deploy', async () => {
            sinon.stub(rokuDeploy, 'enablePerfettoTracing').rejects(new Error(`Could not enable perfetto tracing: Channel 'dev' not running`));

            await expectThrowsAsync(() => rokuECP.enablePerfettoTracing({ device: { host: '1.1.1.1' }, appId: 'dev' }), `Could not enable perfetto tracing: Channel 'dev' not running`);
        });
    });

    describe('triggerHeapSnapshot', () => {
        const heapSnapshotResult: RokuHeapSnapshotTrigger = {
            timestamp: 1772434731151,
            timestampEnd: 1772434731188
        };

        it('calls rokuDeploy.triggerHeapSnapshot with the device option', async () => {
            let options = {
                device: { host: '1.1.1.1' },
                remotePort: 8080,
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'triggerHeapSnapshot').resolves(heapSnapshotResult);

            let result = await rokuECP.triggerHeapSnapshot(options);
            expect(stub.getCall(0).args).to.eql([{
                device: { host: '1.1.1.1' },
                appId: 'dev',
                ecpPort: 8080
            }]);
            expect(result).to.eql({
                timestamp: 1772434731151,
                timestampEnd: 1772434731188,
                status: EcpStatus.ok
            } as EcpHeapSnapshotData);
        });

        it('passes an RCE device config through to roku-deploy', async () => {
            let options = {
                device: { instanceUrl: 'https://device.rce.roku.com/instance/my-instance', rceToken: 'my-rce-token' },
                appId: 'dev'
            };

            let stub = sinon.stub(rokuDeploy, 'triggerHeapSnapshot').resolves(heapSnapshotResult);

            await rokuECP.triggerHeapSnapshot(options);
            expect(stub.getCall(0).args).to.eql([{
                device: options.device,
                appId: 'dev',
                ecpPort: undefined
            }]);
            expect(stub.getCall(0).args[0].device).to.equal(options.device);
        });

        it('propagates errors from roku-deploy', async () => {
            sinon.stub(rokuDeploy, 'triggerHeapSnapshot').rejects(new Error(`Could not trigger heap snapshot: Channel 'dev' not running, cannot fetch heap graph`));

            await expectThrowsAsync(() => rokuECP.triggerHeapSnapshot({ device: { host: '1.1.1.1' }, appId: 'dev' }), `Could not trigger heap snapshot: Channel 'dev' not running, cannot fetch heap graph`);
        });
    });

});
