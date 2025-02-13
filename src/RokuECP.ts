
import { util } from './util';
import type * as requestType from 'request';
import type { Response } from 'request';
import * as r from 'postman-request';
const request = r as typeof requestType;


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
                const status = parsed['plugin-registry'].status[0];

                if (status === 'OK') {
                    let registry = parsed['plugin-registry'].registry?.[0];
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
                        status: 'OK'
                    };
                } else {
                    return {
                        status: 'FAILED',
                        errorMessage: parsed?.['plugin-registry']?.error?.[0] ?? 'Unknown error'
                    };
                }
            } catch {
                //if the response is not xml, just return the body as-is
                return {
                    status: 'FAILED',
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

export interface EcpRegistryData {
    devId?: string;
    plugins?: Array<string>;
    sections?: Record<string, Record<string, string>>;
    spaceAvailable?: string;
    status: 'OK' | 'FAILED';
    errorMessage?: string;
}

export type RokuEcpParam<T extends keyof RokuECP> = Parameters<RokuECP[T]>[0];

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

export const rokuECP = new RokuECP();
