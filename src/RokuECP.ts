import { util } from './util';
import type * as requestType from 'request';
import type { Response } from 'request';

export class RokuECP {
    private async doRequest(route: string, options: BaseOptions): Promise<Response> {
        const url = `http://${options.host}:${options.remotePort ?? 8060}/${route.replace(/^\//, '')}`;
        return util.httpGet(url, options.requestOptions);
    }

    public async getRegistry(options: BaseOptions & { appId: string }): Promise<EcpRegistryData> {
        let result = await this.doRequest(`query/registry/${options.appId}`, options);
        return this.processRegistry(result);
    }

    private async processRegistry(response: Response): Promise<EcpRegistryData> {
        if (typeof response.body === 'string') {
            try {
                let parsed = await util.parseXml(response.body) as RegistryAsJson;
                const status = EcpStatus[parsed['plugin-registry']?.status?.[0]?.toLowerCase()] ?? EcpStatus.failed;

                if (status === EcpStatus.ok) {
                    const registry = parsed['plugin-registry'].registry?.[0];
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
                } else {
                    return {
                        status: status,
                        errorMessage: parsed?.['plugin-registry']?.error?.[0] ?? 'Unknown error'
                    };
                }
            } catch {
                //if the response is not xml, just return the body as-is
                return {
                    status: EcpStatus.failed,
                    errorMessage: response.body ?? 'Unknown error'
                };
            }
        }
    }

    public async getAppState(options: BaseOptions & { appId: string }): Promise<EcpAppStateData> {
        let result = await this.doRequest(`query/app-status/${options.appId}`, options);
        return this.processAppState(result);
    }

    private async processAppState(response: Response): Promise<EcpAppStateData> {
        if (typeof response.body === 'string') {
            try {
                let parsed = await util.parseXml(response.body) as AppStateAsJson;
                const status = EcpStatus[parsed?.['app-state']?.status?.[0]?.toLowerCase()] ?? EcpStatus.failed;
                if (status === EcpStatus.ok) {
                    const appState = parsed['app-state'];
                    const state = AppState[appState.state?.[0]?.toLowerCase()] ?? AppState.unknown;
                    return {
                        appId: appState['app-id']?.[0],
                        appDevId: appState['app-dev-id']?.[0],
                        appTitle: appState['app-title']?.[0],
                        appVersion: appState['app-version']?.[0],
                        state: state,
                        status: status
                    };
                } else {
                    return {
                        status: status,
                        errorMessage: parsed['app-state']?.error?.[0] ?? 'Unknown error'
                    };
                }
            } catch {
                //if the response is not xml, just return the body as-is
                return {
                    status: EcpStatus.failed,
                    errorMessage: response.body ?? 'Unknown error'
                };
            }
        }
    }

    public async exitApp(options: BaseOptions & { appId: string }): Promise<EcpExitAppData> {
        let result = await this.doRequest(`exit-app/${options.appId}`, options);
        return this.processExitApp(result);
    }

    private async processExitApp(response: Response): Promise<EcpExitAppData> {
        if (typeof response.body === 'string') {
            try {
                let parsed = await util.parseXml(response.body) as ExitAppAsJson;
                const status = EcpStatus[parsed?.['exit-app']?.status?.[0]?.toLowerCase()] ?? EcpStatus.failed;
                if (status === EcpStatus.ok) {
                    return { status: status };
                } else {
                    return {
                        status: status,
                        errorMessage: parsed?.['exit-app']?.error?.[0] ?? 'Unknown error'
                    };
                }
            } catch {
                //if the response is not xml, just return the body as-is
                return {
                    status: EcpStatus.failed,
                    errorMessage: response.body ?? 'Unknown error'
                };
            }
        }
    }
}

interface BaseOptions {
    host: string;
    remotePort?: number;
    requestOptions?: requestType.CoreOptions;
}

export type RokuEcpParam<T extends keyof RokuECP> = Parameters<RokuECP[T]>[0];

export enum EcpStatus {
    ok = 'ok',
    failed = 'failed'
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

export interface EcpRegistryData {
    devId?: string;
    plugins?: Array<string>;
    sections?: Record<string, Record<string, string>>;
    spaceAvailable?: string;
    state?: string;
    status: EcpStatus;
    errorMessage?: string;
}
interface AppStateAsJson {
    'app-state': {
        'app-id': [string];
        'app-title': [string];
        'app-version': [string];
        'app-dev-id': [string];
        state: ['active' | 'background' | 'inactive'];
        status: [string];
        error?: [string];
    };
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

interface ExitAppAsJson {
    'exit-app': {
        status: [string];
        error?: [string];
    };
}

export interface EcpExitAppData {
    status: EcpStatus;
    errorMessage?: string;
}


export const rokuECP = new RokuECP();
