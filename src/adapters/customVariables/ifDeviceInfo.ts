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
        name: '$modeldisplayname',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModelDisplayName()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modeltype',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModelType()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$modeldetails',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetModelDetails()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$friendlyname',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetFriendlyName()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$osversion',
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
        name: '$ridadisabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRIDADisabled()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$channelclientid',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetChannelClientId()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$usercountrycode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUserCountryCode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$randomuuid',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRandomUUID()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timezone',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetTimeZone()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$currentlocale',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCurrentLocale()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$countrycode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCountryCode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$preferredcaptionlanguage',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPreferredCaptionLanguage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timesincelastkeypress',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.TimeSinceLastKeypress()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$drminfoex',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDrmInfoEx()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$captionsmode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetCaptionsMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$clockformat',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetClockFormat()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$clockvalid',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsClockValid()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$generalmemorylevel',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetGeneralMemoryLevel()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$storedemomode',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsStoreDemoMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$linkstatus',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetLinkStatus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$connectiontype',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetConnectionType()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$internetstatus',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInternetStatus()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$externalip',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetExternalIp()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$ipaddrs',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetIPAddrs()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$connectioninfo',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetConnectionInfo()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displaytype',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayType()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displaymode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayaspectratio',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayAspectRatio()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displaysize',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplaySize()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$videomode',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVideoMode()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$displayproperties',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetDisplayProperties()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$supportedgraphicsresolutions',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSupportedGraphicsResolutions()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$uiresolution',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetUIResolution()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$graphicsplatform',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetGraphicsPlatform()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audiooutputchannel',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAudioOutputChannel()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$passthrucodecactive',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsPassthruCodecActive()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$soundeffectsvolume',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetSoundEffectsVolume()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$audioguideenabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsAudioGuideEnabled()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$autoplayenabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsAutoplayEnabled()`,
        lazy: true,
        value: '',
        children: []
    });
}
