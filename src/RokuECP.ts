import { util } from './util';
import type * as requestType from 'request';
import type { Response } from 'request';

export class RokuECP {
    private async doRequest(route: string, options: BaseOptions): Promise<Response> {
        const url = `http://${options.host}:${options.remotePort ?? 8060}/${route.replace(/^\//, '')}`;
        return util.httpGet(url, options.requestOptions);
    }

    private getEcpStatus(response: ParsedEcpRoot, rootKey: string): EcpStatus {
        return EcpStatus[response?.[rootKey]?.status?.[0]?.toLowerCase()] ?? EcpStatus.failed;
    }

    private async parseResponse<R>(response: Response, rootKey: string, callback: (parsed: any, status: EcpStatus) => R): Promise<R | { status: EcpStatus; errorMessage: string }> {
        if (typeof response.body === 'string') {
            try {
                let parsed = await util.parseXml<ParsedEcpRoot>(response.body);
                const status = this.getEcpStatus(parsed, rootKey);
                if (status === EcpStatus.ok) {
                    return callback(parsed?.[rootKey], status);
                } else {
                    return {
                        status: status,
                        errorMessage: parsed?.[rootKey]?.error?.[0] ?? 'Unknown error'
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

    public async getRegistry(options: BaseOptions & { appId: string }) {
        let result = await this.doRequest(`query/registry/${options.appId}`, options);
        return this.processRegistry(result);
    }

    private async processRegistry(response: Response) {
        return this.parseResponse(response, 'plugin-registry', (parsed: RegistryAsJson, status): EcpRegistryData => {
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
        let result = await this.doRequest(`query/app-status/${options.appId}`, options);
        return this.processAppState(result);
    }

    private async processAppState(response: Response) {
        return this.parseResponse(response, 'app-state', (parsed: AppStateAsJson, status): EcpAppStateData => {
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
        let result = await this.doRequest(`exit-app/${options.appId}`, options);
        return this.processExitApp(result);
    }

    private async processExitApp(response: Response): Promise<EcpExitAppData> {
        return this.parseResponse(response, 'exit-app', (parsed: ExitAppAsJson, status): EcpExitAppData => {
            return { status: status };
        });
    }
}

export enum EcpStatus {
    ok = 'ok',
    failed = 'failed'
}
interface BaseOptions {
    host: string;
    remotePort?: number;
    requestOptions?: requestType.CoreOptions;
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
    error?: [string] ;
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

type ExitAppAsJson = ParsedEcpBase;

export interface EcpExitAppData {
    status: EcpStatus;
    errorMessage?: string;
}


export const rokuECP = new RokuECP();
