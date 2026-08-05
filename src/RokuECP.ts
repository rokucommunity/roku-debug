import { util } from './util';
import type * as requestType from 'request';
import { rokuDeploy } from 'roku-deploy';
import type { DeviceConfig, EcpResult } from 'roku-deploy';

export class RokuECP {
    /**
     * Send a raw ECP request through roku-deploy's `sendEcpRequest()` transport, which routes a local device
     * over plain HTTP and a Roku Cloud Emulator device through its instance's ECP proxy.
     */
    private async doRequest(route: string, options: BaseOptions, method: 'post' | 'get' = 'get'): Promise<EcpResult> {
        return rokuDeploy.sendEcpRequest(options.device, route, {
            method: method === 'post' ? 'POST' : 'GET',
            ecpPort: options.remotePort,
            timeout: options.requestOptions?.timeout
        });
    }

    /**
     * Enables perfetto tracing for the specified channel
     * @param channelID
     * @returns
     */
    public async enablePerfettoTracing(options: BaseOptions & { channelId: string }) {
        const response = await this.doRequest(`/perfetto/enable/${options.channelId}`, options, 'post');

        return this.parseResponse(response.body, 'perfetto-enable', (parsed: PerfettoEnableAsJson, status): EcpPerfettoEnableData => {
            return {
                enabledChannels: parsed?.['enabled-channels']?.[0]?.channel ?? [],
                timestamp: Number(parsed?.timestamp?.[0]),
                timestampEnd: Number(parsed?.['timestamp-end']?.[0]),
                status: status
            };
        });
    }

    /**
     * capture a heap snapshot. This doesn't return it, but instead will cause it to be written to the already-connected perfetto websocket.
     * @param channelId
     * @returns
     */
    public async captureHeapSnapshot(options: BaseOptions & { channelId: string }) {
        const response = await this.doRequest(`/perfetto/heapgraph/trigger/${options.channelId}`, options, 'post');
        return this.parseResponse(response.body, 'perfetto-heapgraph-trigger', (parsed: HeapSnapshotAsJson, status): EcpHeapSnapshotData => {
            return {
                timestamp: Number(parsed?.timestamp?.[0]),
                timestampEnd: Number(parsed?.['timestamp-end']?.[0]),
                status: status
            };
        });
    }

    private getEcpStatus(response: ParsedEcpRoot, rootKey: string): EcpStatus {
        return EcpStatus[response?.[rootKey]?.status?.[0]?.toLowerCase()] ?? EcpStatus.failed;
    }

    private async parseResponse<R>(body: string, rootKey: string, callback: (parsed: any, status: EcpStatus) => R): Promise<R> {
        if (typeof body === 'string') {
            let parsed: ParsedEcpRoot;
            try {
                parsed = await util.parseXml<ParsedEcpRoot>(body);
            } catch {
                //if the response is not xml, just return the body as-is
                throw new Error(body ?? 'Unknown error');
            }

            const status = this.getEcpStatus(parsed, rootKey);
            if (status === EcpStatus.ok) {
                return callback(parsed?.[rootKey], status);
            } else {
                throw new Error(parsed?.[rootKey]?.error?.[0] ?? 'Unknown error');
            }
        }
    }

    public async getRegistry(options: BaseOptions & { appId: string }): Promise<EcpRegistryData> {
        const registry = await rokuDeploy.queryRegistry({
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
        const appState = await rokuDeploy.queryAppState({
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
    requestOptions?: requestType.CoreOptions;
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

export type ParsedEcpRoot<T1 extends string = string, T2 extends ParsedEcpBase = ParsedEcpBase> = {
    [key in T1]: T2;
};

interface ParsedEcpBase {
    status?: [string];
    error?: [string];
}

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

interface PerfettoEnableAsJson extends ParsedEcpBase {
    'enabled-channels': [{ channel: string[] }];
    timestamp: [string];
    'timestamp-end': [string];
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

interface HeapSnapshotAsJson extends ParsedEcpBase {
    timestamp: [string];
    'timestamp-end': [string];
}

export interface EcpHeapSnapshotData extends BaseEcpResponse {
    timestamp: number;
    timestampEnd: number;
}


export const rokuECP = new RokuECP();
