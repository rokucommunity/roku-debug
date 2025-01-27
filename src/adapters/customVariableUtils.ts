import * as semver from 'semver';
import { KeyType } from './DebugProtocolAdapter';
import type { DebugProtocolAdapter, EvaluateContainer } from './DebugProtocolAdapter';
import { HighLevelType } from '../interfaces';
import { VariableType } from '../debugProtocol/events/responses/VariablesResponse';

import * as customVariables from './customVariables';

// List of Roku object types that can have custom variables added to them.
// If the type is commented out, it means ether there is no custom variables
// for that type or the custom variables we would add are redundant on that type
enum RokuObjectTypes {
    roAppInfo = 'roAppInfo',
    roAppManager = 'roAppManager',
    roAppMemoryMonitor = 'roAppMemoryMonitor',
    // roArray = 'roArray',
    // roAssociativeArray = 'roAssociativeArray',
    // roAudioGuide = 'roAudioGuide',
    roAudioMetadata = 'roAudioMetadata',
    roAudioPlayer = 'roAudioPlayer',
    roAudioResource = 'roAudioResource',
    roBitmap = 'roBitmap',
    // roBoolean = 'roBoolean',
    roByteArray = 'roByteArray',
    roCECStatus = 'roCECStatus',
    roChannelStore = 'roChannelStore',
    // roCompositor = 'roCompositor',
    roDatagramSocket = 'roDatagramSocket',
    roDateTime = 'roDateTime',
    roDeviceInfo = 'roDeviceInfo',
    // roDouble = 'roDouble',
    // roDeviceCrypto = 'roDeviceCrypto',
    // roDsa = 'roDsa',
    // roEVPCipher = 'roEVPCipher',
    // roEVPDigest = 'roEVPDigest',
    roFilesystem = 'roFilesystem',
    // roFloat = 'roFloat',
    roFont = 'roFont',
    roFontRegistry = 'roFontRegistry',
    // roFunction = 'roFunction',
    roHdmiStatus = 'roHdmiStatus',
    // roHMAC = 'roHMAC',
    // roHttpAgent = 'roHttpAgent',
    roImageMetadata = 'roImageMetadata',
    roInput = 'roInput',
    // roInt = 'roInt',
    // roInvalid = 'roInvalid',
    roList = 'roList',
    List = 'List',
    // roLocalization = 'roLocalization',
    // roLongInteger = 'roLongInteger',
    roMessagePort = 'roMessagePort',
    roMicrophone = 'roMicrophone',
    roPath = 'roPath',
    roProgramGuide = 'roProgramGuide',
    // roRegex = 'roRegex',
    roRegion = 'roRegion',
    roRegistry = 'roRegistry',
    roRegistrySection = 'roRegistrySection',
    // roRemoteInfo = 'roRemoteInfo',
    // roRSA = 'roRSA',
    roScreen = 'roScreen',
    roSGNode = 'roSGNode',
    roSGScreen = 'roSGScreen',
    roSocketAddress = 'roSocketAddress',
    roSprite = 'roSprite',
    roStreamSocket = 'roStreamSocket',
    // roString = 'roString',
    // roSystemLog = 'roSystemLog',
    roTextToSpeech = 'roTextToSpeech',
    roTextureManager = 'roTextureManager',
    roTextureRequest = 'roTextureRequest',
    roTimespan = 'roTimespan',
    roUrlTransfer = 'roUrlTransfer',
    roVideoPlayer = 'roVideoPlayer',
    roXMLElement = 'roXMLElement',
    roXMLList = 'roXMLList',

    // EVENTS
    roAppMemoryNotificationEvent = 'roAppMemoryNotificationEvent',
    roAudioPlayerEvent = 'roAudioPlayerEvent',
    roCECStatusEvent = 'roCECStatusEvent',
    roChannelStoreEvent = 'roChannelStoreEvent',
    roDeviceInfoEvent = 'roDeviceInfoEvent',
    roFileSystemEvent = 'roFileSystemEvent',
    roHdmiStatusEvent = 'roHdmiStatusEvent',
    roInputEvent = 'roInputEvent',
    roMicrophoneEvent = 'roMicrophoneEvent',
    roSGNodeEvent = 'roSGNodeEvent',
    roSGScreenEvent = 'roSGScreenEvent',
    roSocketEvent = 'roSocketEvent',
    roSystemLogEvent = 'roSystemLogEvent',
    roTextToSpeechEvent = 'roTextToSpeechEvent',
    roTextureRequestEvent = 'roTextureRequestEvent',
    roUniversalControlEvent = 'roUniversalControlEvent',
    roUrlEvent = 'roUrlEvent',
    roVideoPlayerEvent = 'roVideoPlayerEvent'
}

/**
 * Insert custom variables into the `EvaluateContainer`. Most of these are for compatibility with older versions of the BrightScript debug protocol,
 * but occasionally can be for adding new functionality for properties that don't exist in the debug protocol. Some of these will run `evaluate` commands
 * to look up the data for the custom variables.
 */
export async function insertCustomVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    try {
        switch (container.type) {
            case RokuObjectTypes.roAppInfo:
                customVariables.pushIfAppInfoVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAppManager:
                customVariables.pushIfAppManagerVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAppMemoryMonitor:
                customVariables.pushIfAppMemoryMonitorVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roArray:
            //     customVariables.pushIfEnumVariables(adapter, expression, container);
            //     break;
            // case RokuObjectTypes.roAssociativeArray:
            //     customVariables.pushIfEnumVariables(adapter, expression, container);
            //     break;
            // case RokuObjectTypes.roAudioGuide:
            //     break;
            case RokuObjectTypes.roAudioMetadata:
                customVariables.pushIfAudioMetadataVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAudioPlayer:
                customVariables.pushIfHttpAgentVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAudioResource:
                customVariables.pushIfAudioResourceVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roBitmap:
                customVariables.pushIfDraw2DVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roBoolean:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            case RokuObjectTypes.roByteArray:
                customVariables.pushIfByteArrayVariables(adapter, expression, container);
                customVariables.pushIfEnumVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roCECStatus:
                customVariables.pushIfCECStatusVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roChannelStore:
                customVariables.pushIfChannelStoreVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roCompositor:
            //     break;
            case RokuObjectTypes.roDatagramSocket:
                customVariables.pushIfSocketVariables(adapter, expression, container);
                customVariables.pushIfSocketAsyncVariables(adapter, expression, container);
                customVariables.pushIfSocketStatusVariables(adapter, expression, container);
                customVariables.pushIfSocketOptionVariables(adapter, expression, container);
                customVariables.pushIfSocketCastOptionVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roDateTime:
                customVariables.pushIfDateTimeVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roDeviceInfo:
                customVariables.pushIfDeviceInfoVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roDouble:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            // case RokuObjectTypes.roDeviceCrypto:
            //     break;
            // case RokuObjectTypes.roDsa:
            //     break;
            // case RokuObjectTypes.roEVPCipher:
            //     break;
            // case RokuObjectTypes.roEVPDigest:
            //     break;
            case RokuObjectTypes.roFilesystem:
                customVariables.pushIfFileSystemVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roFloat:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            case RokuObjectTypes.roFont:
                customVariables.pushIfFontVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roFontRegistry:
                customVariables.pushIfFontRegistryVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roFunction:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            case RokuObjectTypes.roHdmiStatus:
                customVariables.pushIfHdmiStatusVariables(adapter, expression, container);
                // TODO: Not listed in the docs, Need to check if this is a documentation error or if it is missing the interface
                // as the ifSetMessagePort is listed as a supported interface
                // customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roHMAC:
            //     break;
            // case RokuObjectTypes.roHttpAgent:
            //     customVariables.pushIfHttpAgentVariables(adapter, expression, container);
            //     break;
            case RokuObjectTypes.roImageMetadata:
                customVariables.pushIfImageMetadataVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roInput:
                customVariables.pushIfInputVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roInt:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            // case RokuObjectTypes.roInvalid:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            case RokuObjectTypes.roList:
            case RokuObjectTypes.List:
                customVariables.pushIfListToArrayVariables(adapter, expression, container);
                customVariables.pushIfEnumVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roLocalization:
            //     break;
            // case RokuObjectTypes.roLongInteger:
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            case RokuObjectTypes.roMessagePort:
                customVariables.pushIfMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roMicrophone:
                customVariables.pushIfMicrophoneVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roPath:
                customVariables.pushIfPathVariables(adapter, expression, container);
                customVariables.pushIfStringVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roProgramGuide:
                customVariables.pushIfProgramGuideVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roRegex:
            //     break;
            case RokuObjectTypes.roRegion:
                customVariables.pushIfRegionVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roRegistry:
                customVariables.pushIfRegistryVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roRegistrySection:
                customVariables.pushIfRegistrySectionVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roRemoteInfo:
            //     break;
            // case RokuObjectTypes.roRSA:
            //     break;
            case RokuObjectTypes.roScreen:
                customVariables.pushIfDraw2DVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSGNode:
                customVariables.pushIfSGNodeChildrenVariables(adapter, expression, container);
                customVariables.pushIfSGNodeFieldVariables(adapter, expression, container);
                customVariables.pushIfSGNodeDictVariables(adapter, expression, container);
                customVariables.pushIfSGNodeBoundingRectVariables(adapter, expression, container);
                customVariables.pushIfSGNodeHttpAgentAccessVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSGScreen:
                customVariables.pushIfSGScreenVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSocketAddress:
                customVariables.pushIfSocketAddressVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSprite:
                customVariables.pushIfSpriteVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roStreamSocket:
                customVariables.pushIfSocketConnectionVariables(adapter, expression, container);
                customVariables.pushIfSocketVariables(adapter, expression, container);
                customVariables.pushIfSocketAsyncVariables(adapter, expression, container);
                customVariables.pushIfSocketStatusVariables(adapter, expression, container);
                customVariables.pushIfSocketConnectionStatusVariables(adapter, expression, container);
                customVariables.pushIfSocketConnectionOptionVariables(adapter, expression, container);
                customVariables.pushIfSocketOptionVariables(adapter, expression, container);
                break;
            // case RokuObjectTypes.roString:
            //     customVariables.pushIfStringVariables(adapter, expression, container);
            //     customVariables.pushIfStringOpsVariables(adapter, expression, container);
            //     customVariables.pushIfToStrVariables(adapter, expression, container);
            //     break;
            // case RokuObjectTypes.roSystemLog:
            //     break;
            case RokuObjectTypes.roTextToSpeech:
                customVariables.pushIfTextToSpeechVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roTextureManager:
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                customVariables.pushIfHttpAgentVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roTextureRequest:
                customVariables.pushIfTextureRequestVariables(adapter, expression, container);
                customVariables.pushIfHttpAgentVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roTimespan:
                customVariables.pushIfTimeSpanVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roUrlTransfer:
                customVariables.pushIfUrlTransferVariables(adapter, expression, container);
                customVariables.pushIfHttpAgentVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roVideoPlayer:
                customVariables.pushIfVideoPlayerVariables(adapter, expression, container);
                customVariables.pushIfHttpAgentVariables(adapter, expression, container);
                customVariables.pushIfGetMessagePortVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roXMLElement:
                customVariables.pushIfXMLElementVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roXMLList:
                customVariables.pushIfListVariables(adapter, expression, container);
                customVariables.pushIfXMLListVariables(adapter, expression, container);
                customVariables.pushIfListToArrayVariables(adapter, expression, container);
                break;

            // EVENTS
            case RokuObjectTypes.roAppMemoryNotificationEvent:
                customVariables.pushRoAppMemoryNotificationEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roAudioPlayerEvent:
                customVariables.pushRoAudioPlayerEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roCECStatusEvent:
                customVariables.pushRoCECStatusEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roChannelStoreEvent:
                customVariables.pushRoChannelStoreEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roDeviceInfoEvent:
                customVariables.pushRoDeviceInfoEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roFileSystemEvent:
                customVariables.pushRoFileSystemEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roHdmiStatusEvent:
                customVariables.pushRoHdmiStatusEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roInputEvent:
                customVariables.pushRoInputEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roMicrophoneEvent:
                customVariables.pushRoMicrophoneEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSGNodeEvent:
                customVariables.pushRoSGNodeEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSGScreenEvent:
                customVariables.pushRoSGScreenEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSocketEvent:
                customVariables.pushRoSocketEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roSystemLogEvent:
                customVariables.pushRoSystemLogEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roTextToSpeechEvent:
                customVariables.pushRoTextToSpeechEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roTextureRequestEvent:
                customVariables.pushRoTextureRequestEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roUniversalControlEvent:
                customVariables.pushRoUniversalControlEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roUrlEvent:
                customVariables.pushRoUrlEventVariables(adapter, expression, container);
                break;
            case RokuObjectTypes.roVideoPlayerEvent:
                customVariables.pushRoVideoPlayerEventVariables(adapter, expression, container);
                break;
            default:
                break;
        }

        // catch all for adding a count
        if (container.elementCount > 0 || container.type === 'Array') {
            customVariables.pushCustomVariableToContainer(container, {
                name: '$count',
                type: VariableType.Integer,
                presentationHint: 'virtual',
                evaluateName: container.elementCount.toString(),
                value: container.elementCount.toString(),
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
        if (RokuObjectTypes[container.type]) {
            container.keyType = KeyType.string;
        }
    }
}
