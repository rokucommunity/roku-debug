import { util } from './util';
import type * as requestType from 'request';
import type { Response } from 'request';
import { RceDevice, isRceDeviceConfig } from 'roku-deploy';
import type { DeviceOption, EcpResponse } from 'roku-deploy';

export class RokuECP {
    private async doRequest(route: string, options: BaseOptions, method: 'post' | 'get' = 'get'): Promise<Response> {
        const url = `http://${options.host}:${options.remotePort ?? 8060}/${route.replace(/^\//, '')}`;
        if (method === 'post') {
            return util.httpPost(url, options.requestOptions);
        } else {
            return util.httpGet(url, options.requestOptions);
        }
    }

    /**
     * Get the XML body for an ECP verb, routing through the target device's transport.
     * When `options.device` is an RCE (Roku Cloud Emulator) device config, the request goes over the
     * ECP2 websocket via `RceDevice`. Otherwise it falls back to the local HTTP ECP endpoint.
     * The XML root elements and shapes are identical between the two transports, so callers can feed
     * the returned body into the same parsing logic regardless of which transport was used.
     * @param options the verb options, including the optional `device` used to pick the transport
     * @param localRoute the local HTTP ECP route to use when the device is not an RCE device
     * @param method the HTTP method to use for the local route
     * @param rceCall invokes the matching `RceDevice` ECP2 method when the device is an RCE device
     */
    private async fetchEcpBody(options: BaseOptions, localRoute: string, method: 'get' | 'post', rceCall: (device: RceDevice) => Promise<EcpResponse>): Promise<string> {
        const device = options.device;
        if (typeof device === 'object' && isRceDeviceConfig(device)) {
            const response = await rceCall(new RceDevice(device));
            return response.content ?? '';
        }
        const response = await this.doRequest(localRoute, options, method);
        return typeof response.body === 'string' ? response.body : '';
    }

    /**
     * Enables perfetto tracing for the specified channel
     * @param channelID
     * @returns
     */
    public async enablePerfettoTracing(options: BaseOptions & { channelId: string }) {
        const response = await this.doRequest(`/perfetto/enable/${options.channelId}`, options, 'post');

        return this.parseResponse(response.body as string, 'perfetto-enable', (parsed: PerfettoEnableAsJson, status): EcpPerfettoEnableData => {
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
        return this.parseResponse(response.body as string, 'perfetto-heapgraph-trigger', (parsed: HeapSnapshotAsJson, status): EcpHeapSnapshotData => {
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

    public async getRegistry(options: BaseOptions & { appId: string }) {
        const body = await this.fetchEcpBody(options, `query/registry/${options.appId}`, 'get', (device) => device.queryRegistry(options.appId));
        return this.processRegistry(body);
    }

    private async processRegistry(body: string) {
        return this.parseResponse(body, 'plugin-registry', (parsed: RegistryAsJson, status): EcpRegistryData => {
            const registry = parsed?.registry?.[0];
            let sections: EcpRegistryData['sections'] = {};

            for (const section of registry?.sections?.[0]?.section ?? []) {
                if (typeof section === 'string') {
                    continue;
                }
                let sectionName = section.name[0];
                for (const item of section.items[0].item) {
                    sections[sectionName] ??= {};
                    sections[sectionName][item.key[0]] = item.value[0];
                }
            }

            return {
                devId: registry?.['dev-id']?.[0],
                plugins: registry?.plugins?.[0]?.split(','),
                sections: sections,
                spaceAvailable: registry?.['space-available']?.[0],
                status: status
            };
        });
    }

    public async getAppState(options: BaseOptions & { appId: string }) {
        const body = await this.fetchEcpBody(options, `query/app-state/${options.appId}`, 'get', (device) => device.queryAppState(options.appId));
        return this.processAppState(body);
    }

    private async processAppState(body: string) {
        return this.parseResponse(body, 'app-state', (parsed: AppStateAsJson, status): EcpAppStateData => {
            const state = AppState[parsed.state?.[0]?.toLowerCase()] ?? AppState.unknown;
            return {
                appId: parsed['app-id']?.[0],
                appDevId: parsed['app-dev-id']?.[0],
                appTitle: parsed['app-title']?.[0],
                appVersion: parsed['app-version']?.[0],
                state: state,
                status: status
            };
        });
    }

    public async exitApp(options: BaseOptions & { appId: string }): Promise<EcpExitAppData> {
        const body = await this.fetchEcpBody(options, `exit-app/${options.appId}`, 'post', (device) => device.exitApp(options.appId));
        return this.processExitApp(body);
    }

    private async processExitApp(body: string): Promise<EcpExitAppData> {
        return this.parseResponse(body, 'exit-app', (parsed: ExitAppAsJson, status): EcpExitAppData => {
            return { status: status };
        });
    }
}

export enum EcpStatus {
    ok = 'ok',
    failed = 'failed'
}
interface BaseOptions {
    /**
     * The host used when `device` is not an RCE (Roku Cloud Emulator) device config.
     */
    host: string;
    remotePort?: number;
    requestOptions?: requestType.CoreOptions;
    /**
     * The roku-deploy device option for the target device. When this is an RCE device config, the
     * request is routed over ECP2 via `RceDevice` instead of the local HTTP ECP endpoint.
     */
    device?: DeviceOption;
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

interface RegistryAsJson extends ParsedEcpBase {
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
}

export interface EcpRegistryData extends BaseEcpResponse {
    devId?: string;
    plugins?: Array<string>;
    sections?: Record<string, Record<string, string>>;
    spaceAvailable?: string;
    state?: string;
}
interface AppStateAsJson extends ParsedEcpBase {
    'app-id': [string];
    'app-title': [string];
    'app-version': [string];
    'app-dev-id': [string];
    state: ['active' | 'background' | 'inactive'];
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

type ExitAppAsJson = ParsedEcpBase;

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
