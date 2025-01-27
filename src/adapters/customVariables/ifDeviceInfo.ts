import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifdeviceinfo.md
export function pushIfDeviceInfoVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$model',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModel()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modelDisplayName',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModelDisplayName()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modelType',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModelType()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modelDetails',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModelDetails()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$friendlyName',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetFriendlyName()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$osVersion',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetOSVersion()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$rida',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRIDA()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRIDADisabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRIDADisabled()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$channelClientId',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChannelClientId()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$userCountryCode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUserCountryCode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$randomUUID',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRandomUUID()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timeZone',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTimeZone()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$currentLocale',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCurrentLocale()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countryCode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCountryCode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$preferredCaptionLanguage',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPreferredCaptionLanguage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timeSinceLastKeypress',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.TimeSinceLastKeypress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$drmInfoEx',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDrmInfoEx()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$captionsMode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCaptionsMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$clockFormat',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetClockFormat()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isClockValid',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsClockValid()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$generalMemoryLevel',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetGeneralMemoryLevel()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStoreDemoMode',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsStoreDemoMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$linkStatus',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetLinkStatus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$connectionType',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetConnectionType()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$internetStatus',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInternetStatus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$externalIp',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetExternalIp()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ipAddrs',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetIPAddrs()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$connectionInfo',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetConnectionInfo()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayType',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayType()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayMode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayAspectRatio',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayAspectRatio()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displaySize',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplaySize()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$videoMode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVideoMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayProperties',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayProperties()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$supportedGraphicsResolutions',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSupportedGraphicsResolutions()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$uiResolution',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUIResolution()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$graphicsPlatform',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetGraphicsPlatform()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audioOutputChannel',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAudioOutputChannel()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isPassThruCodecActive',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsPassthruCodecActive()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$soundEffectsVolume',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSoundEffectsVolume()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isAudioGuideEnabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsAudioGuideEnabled()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isAutoplayEnabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsAutoplayEnabled()`,
        lazy: true,
        value: '',
        children: []
    });
}
