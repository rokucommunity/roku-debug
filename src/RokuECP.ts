import type { HttpRequestOptions } from './util';
import { rokuDeploy } from 'roku-deploy';
import type { DeviceConfig } from 'roku-deploy';

export class RokuECP {
    /**
     * Enables perfetto tracing for the specified channel
     */
    public async enablePerfettoTracing(options: BaseOptions & { appId: string }): Promise<EcpPerfettoEnableData> {
        const result = await rokuDeploy.enablePerfettoTracing({
            device: options.device,
            appId: options.appId,
            ecpPort: options.remotePort
        });
        return {
            enabledChannels: result.enabledChannels,
            timestamp: result.timestamp,
            timestampEnd: result.timestampEnd,
            status: EcpStatus.ok
        };
    }

    /**
     * Trigger a heap snapshot capture. This doesn't return it, but instead will cause it to be written to the already-connected perfetto websocket.
     */
    public async triggerHeapSnapshot(options: BaseOptions & { appId: string }): Promise<EcpHeapSnapshotData> {
        const result = await rokuDeploy.triggerHeapSnapshot({
            device: options.device,
            appId: options.appId,
            ecpPort: options.remotePort
        });
        return {
            timestamp: result.timestamp,
            timestampEnd: result.timestampEnd,
            status: EcpStatus.ok
        };
    }

    public async getRegistry(options: BaseOptions & { appId: string }): Promise<EcpRegistryData> {
        const registry = await rokuDeploy.getRegistry({
            device: options.device,
            appId: options.appId,
            ecpPort: options.remotePort
        });
        return {
            devId: registry.devId,
            plugins: registry.plugins,
            sections: registry.sections,
            spaceAvailable: registry.spaceAvailable,
            status: EcpStatus.ok
        };
    }

    public async getAppState(options: BaseOptions & { appId: string }): Promise<EcpAppStateData> {
        const appState = await rokuDeploy.getAppState({
            device: options.device,
            appId: options.appId,
            ecpPort: options.remotePort
        });
        return {
            appId: appState.appId,
            appDevId: appState.appDevId,
            appTitle: appState.appTitle,
            appVersion: appState.appVersion,
            state: AppState[appState.state] ?? AppState.unknown,
            status: EcpStatus.ok
        };
    }

    public async exitApp(options: BaseOptions & { appId: string }): Promise<EcpExitAppData> {
        await rokuDeploy.exitApp({
            device: options.device,
            appId: options.appId,
            ecpPort: options.remotePort
        });
        return { status: EcpStatus.ok };
    }
}

export enum EcpStatus {
    ok = 'ok',
    failed = 'failed'
}
interface BaseOptions {
    remotePort?: number;
    requestOptions?: HttpRequestOptions;
    /**
     * The roku-deploy device config for the target device. When this is an RCE device config,
     * roku-deploy routes the request through the instance's ECP proxy instead of the local HTTP
     * ECP endpoint.
     */
    device: DeviceConfig;
}

interface BaseEcpResponse {
    status: EcpStatus;
    errorMessage?: string;
}

export type RokuEcpParam<T extends keyof RokuECP> = Parameters<RokuECP[T]>[0];

export interface EcpRegistryData extends BaseEcpResponse {
    devId?: string;
    plugins?: Array<string>;
    sections?: Record<string, Record<string, string>>;
    spaceAvailable?: string;
    state?: string;
}
export enum AppState {
    active = 'active',
    background = 'background',
    inactive = 'inactive',
    unknown = 'unknown'
}

export interface EcpAppStateData {
    appId?: string;
    appTitle?: string;
    appVersion?: string;
    appDevId?: string;
    state?: AppState;
    status: EcpStatus;
    errorMessage?: string;
}

export interface EcpPerfettoEnableData extends BaseEcpResponse {
    enabledChannels: string[];
    timestamp?: number;
    timestampEnd?: number;
}

export interface EcpExitAppData {
    status: EcpStatus;
    errorMessage?: string;
}

export interface EcpHeapSnapshotData extends BaseEcpResponse {
    timestamp?: number;
    timestampEnd?: number;
}

export const rokuECP = new RokuECP();
