import { HighLevelType } from './adapters/DebugProtocolAdapter';
import type { EvaluateContainer } from './adapters/TelnetAdapter';

/**
 * Some Roku objects have function getters for data. This is a list of functions that should be automatically called for those objects when evaulated in the
 * debugger so we can view the underlying data rather than forcing developers to call those functions manually themselves.
 */
export const methodMappings: Record<string, MethodMap[]> = {
    rodeviceinfo: [
        'GetModel',
        'GetModelDisplayName',
        'GetModelDetails{}',
        'GetFriendlyName',
        'GetOSVersion{}',
        'GetRIDA',
        'IsRIDADisabled',
        'GetChannelClientId',
        'GetUserCountryCode',
        'GetRandomUUID',
        'GetTimeZone',
        'GetCurrentLocale',
        'GetCountryCode',
        'GetPreferredCaptionLanguage',
        'TimeSinceLastKeypress',
        //disabled because this takes a full second to calculate
        //'GetDrmInfoEx{}',
        'GetCaptionsMode',
        'GetClockFormat',
        'GetGeneralMemoryLevel',
        'IsStoreDemoMode',
        'GetLinkStatus',
        'GetConnectionType',
        'GetInternetStatus',
        'GetExternalIp',
        'GetIPAddrs{}',
        'GetConnectionInfo{}',
        'GetDisplayType',
        'GetDisplayMode',
        'GetDisplayAspectRatio',
        'GetDisplaySize',
        'GetVideoMode',
        'GetDisplayProperties{}',
        'GetDisplayProperties{}',
        'GetSupportedGraphicsResolutions{}',
        'GetUIResolution{}',
        'GetGraphicsPlatform',
        'GetAudioOutputChannel',
        'GetSoundEffectsVolume',
        'IsAudioGuideEnabled'
    ].map(standardize)
};

function standardize(map: MethodMap | string) {
    let result = map as MethodMap;
    if (typeof map === 'string') {
        result = {
            method: map
        } as MethodMap;
    }
    //shorthand for AA
    if (result.method.endsWith('{}')) {
        result.method = result.method.substr(0, result.method.length - 2);
        result.highLevelType = HighLevelType.object;
        result.type = 'roAssociativeArray';
    } else if (result.method.endsWith('[]')) {
        result.method = result.method.substr(0, result.method.length - 2);
        result.highLevelType = HighLevelType.array;
        result.type = 'roArray';
    }
    //if name was omitted, compute a name by removing `Get` from the front of the method name
    if (!result.name) {
        result.name = '[[' + result.method.replace(/^Get/i, '') + ']]';
    }
    //if high level type is omitted, assume it's a primitive
    if (!result.highLevelType) {
        result.highLevelType = HighLevelType.primative;
    }
    return result;
}

interface MethodMap {
    method: string;
    name: string;
    /**
     * Type is only required when object is a reference type
     */
    type: string;
    highLevelType: HighLevelType;
}
