import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifdeviceinfo.md
export function pushIfDeviceInfoVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$model',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetModel()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modelDisplayName',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetModelDisplayName()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modelType',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetModelType()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modelDetails',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetModelDetails()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$friendlyName',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetFriendlyName()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$osVersion',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetOSVersion()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$rida',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRIDA()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRIDADisabled',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsRIDADisabled()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$channelClientId',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetChannelClientId()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$userCountryCode',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetUserCountryCode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$randomUUID',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetRandomUUID()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timeZone',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTimeZone()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$currentLocale',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCurrentLocale()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countryCode',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCountryCode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$preferredCaptionLanguage',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetPreferredCaptionLanguage()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timeSinceLastKeypress',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.TimeSinceLastKeypress()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$drmInfoEx',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetDrmInfoEx()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$captionsMode',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetCaptionsMode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$clockFormat',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetClockFormat()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isClockValid',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsClockValid()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$generalMemoryLevel',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetGeneralMemoryLevel()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStoreDemoMode',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsStoreDemoMode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$linkStatus',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetLinkStatus()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$connectionType',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetConnectionType()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$internetStatus',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetInternetStatus()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$externalIp',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetExternalIp()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ipAddrs',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetIPAddrs()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$connectionInfo',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetConnectionInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayType',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDisplayType()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayMode',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDisplayMode()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayAspectRatio',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDisplayAspectRatio()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displaySize',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetDisplaySize()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$videoMode',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetVideoMode()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayProperties',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetDisplayProperties()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$supportedGraphicsResolutions',
        type: VariableType.Array,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetSupportedGraphicsResolutions()`,
        value: VariableType.Array,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$uiResolution',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetUIResolution()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$graphicsPlatform',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetGraphicsPlatform()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audioOutputChannel',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetAudioOutputChannel()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isPassThruCodecActive',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsPassthruCodecActive()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$soundEffectsVolume',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetSoundEffectsVolume()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isAudioGuideEnabled',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsAudioGuideEnabled()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isAutoplayEnabled',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsAutoplayEnabled()`,
        value: '',
        children: []
    });
}
