import * as semver from 'semver';
import { KeyType } from './DebugProtocolAdapter';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';
import { HighLevelType } from '../interfaces';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';

/**
 * Insert custom variables into the `EvaluateContainer`. Most of these are for compatibility with older versions of the BrightScript debug protocol,
 * but occasionally can be for adding new functionality for properties that don't exist in the debug protocol. Some of these will run `evaluate` commands
 * to look up the data for the custom variables.
 */
export async function insertCustomVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    try {
        // Added natively as of 3.3.0
        if (semver.satisfies(adapter?.activeProtocolVersion, '<3.3.0')) {
            if (container?.type?.startsWith('roSGNode')) {
                pushCustomVariableToContainer(container, {
                    name: '$children',
                    type: VariableType.Array,
                    keyType: KeyType.integer,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getChildren(-1, 0)`,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$parent',
                    type: 'roSGNode',
                    highLevelType: HighLevelType.object,
                    keyType: KeyType.string,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.getParent()`,
                    children: []
                });

                pushCustomVariableToContainer(container, {
                    name: '$threadinfo',
                    type: VariableType.AssociativeArray,
                    keyType: KeyType.string,
                    presentationHint: 'virtual',
                    evaluateName: `${expression}.threadInfo()`,
                    children: []
                });
            }

            if (container.elementCount > 0 || container.type === 'Array') {
                pushCustomVariableToContainer(container, {
                    name: '$count',
                    type: VariableType.Integer,
                    presentationHint: 'virtual',
                    evaluateName: container.elementCount.toString(),
                    value: container.elementCount.toString(),
                    children: []
                });
            }
        }

        if (container.type === 'roUrlTransfer') {
            pushCustomVariableToContainer(container, {
                name: '$url',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.getUrl()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$useragent',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetUserAgent()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$failurereason',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetFailureReason()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$request',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetRequest()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$identity',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetIdentity()`,
                evaluateNow: true,
                value: '',
                children: []
            });
        }

        if (container.type === 'roDateTime') {
            pushCustomVariableToContainer(container, {
                name: '$timezoneoffset',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetTimeZoneOffset()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$seconds',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.AsSeconds()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$secondslong',
                type: VariableType.LongInteger,
                presentationHint: 'virtual',
                evaluateName: `${expression}.AsSecondsLong()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$iso',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.ToISOString()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$datelocalized',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.asDateStringLoc("full")`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$timelocalized',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.asTimeStringLoc("short")`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$date',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.AsDateStringNoParam()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$year',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetYear()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$month',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetMonth()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$dayofmonth',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetDayOfMonth()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$hours',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetHours()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$minutes',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetMinutes()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$seconds',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetSeconds()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$milliseconds',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetMilliseconds()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$lastdayofmonth',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetLastDayOfMonth()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$dayofweek',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetDayOfWeek()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$weekday',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetWeekday()`,
                lazy: true,
                value: '',
                children: []
            });
        }

        if (container.type === 'roDeviceInfo') {
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
                lazy: true,
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
                lazy: true,
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
                lazy: true,
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
                evaluateName: `${expression}.GetClockFormat()`,
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
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$connectioninfo',
                type: VariableType.AssociativeArray,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetConnectionInfo()`,
                lazy: true,
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
                lazy: true,
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
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$supportedgraphicsresolutions',
                type: VariableType.AssociativeArray,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetSupportedGraphicsResolutions()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$uiresolution',
                type: VariableType.AssociativeArray,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetUIResolution()`,
                lazy: true,
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

        if (container.type === 'roAppInfo') {
            pushCustomVariableToContainer(container, {
                name: '$id',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetID()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$dev',
                type: VariableType.Boolean,
                presentationHint: 'virtual',
                evaluateName: `${expression}.IsDev()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$version',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetVersion()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$title',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetTitle()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$devid',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetDevID()`,
                lazy: true,
                value: '',
                children: []
            });
        }

        if (container.type === 'roAppManager') {
            pushCustomVariableToContainer(container, {
                name: '$uptime',
                type: VariableType.String,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetUptime().TotalMilliseconds()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$screensavertimeout',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetScreensaverTimeout()`,
                lazy: true,
                value: '',
                children: []
            });

            pushCustomVariableToContainer(container, {
                name: '$lastexitinfo',
                type: VariableType.AssociativeArray,
                presentationHint: 'virtual',
                evaluateName: `${expression}.GetLastExitInfo()`,
                lazy: true,
                value: '',
                children: []
            });
        }
    } catch (e) {
        // Error inserting custom variables. We don't want to cause issues with real variables so just move on for now.
    }
    await Promise.resolve();
}

/**
 * Override the key types in preparation for custom variables if required.
 */
export function overrideKeyTypesForCustomVariables(adapter: DebugProtocolAdapter, container: EvaluateContainer) {
    if (!container.keyType) {
        if ([
            'roAppInfo',
            'roAppManager',
            'roUrlTransfer',
            'roDateTime',
            'roDeviceInfo'
        ].includes(container.type)) {
            container.keyType = KeyType.string;
        }
    }
}

/**
 * Push a custom variable to the container if it doesn't already exist.
 */
function pushCustomVariableToContainer(container: EvaluateContainer, customVariable: EvaluateContainer) {
    if (!container.children.some(child => child.name === customVariable.name)) {

        if (customVariable.type === VariableType.AssociativeArray) {
            customVariable.highLevelType = HighLevelType.object;
            customVariable.keyType = KeyType.string;
        } else if (customVariable.type === VariableType.Array) {
            customVariable.highLevelType = HighLevelType.array;
            customVariable.keyType = KeyType.integer;
        }

        container.children.push(customVariable);
    }
}
