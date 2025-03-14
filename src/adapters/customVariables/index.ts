import { pushCustomVariableToContainer } from './utils';

import { pushIfAppInfoVariables } from './ifAppInfo';
import { pushIfAppManagerVariables } from './ifAppManager';
import { pushIfAppMemoryMonitorVariables } from './ifAppMemoryMonitor';
import { pushIfArrayVariables } from './ifArray';
import { pushIfAudioMetadataVariables } from './ifAudioMetadata';
import { pushIfAudioResourceVariables } from './ifAudioResource';
import { pushIfByteArrayVariables } from './ifByteArray';
import { pushIfCECStatusVariables } from './ifCECStatus';
import { pushIfChannelStoreVariables } from './ifChannelStore';
import { pushIfDateTimeVariables } from './ifDateTime';
import { pushIfDeviceInfoVariables } from './ifDeviceInfo';
import { pushIfDraw2DVariables } from './ifDraw2d';
import { pushIfEnumVariables } from './ifEnum';
import { pushIfFileSystemVariables } from './ifFileSystem';
import { pushIfFontVariables } from './ifFont';
import { pushIfFontRegistryVariables } from './ifFontRegistry';
import { pushIfGetMessagePortVariables } from './ifGetMessagePort';
import { pushIfHdmiStatusVariables } from './ifHdmiStatus';
import { pushIfHttpAgentVariables } from './ifHttpAgent';
import { pushIfImageMetadataVariables } from './ifImageMetadata';
import { pushIfInputVariables } from './ifInput';
import { pushIfListVariables } from './ifList';
import { pushIfListToArrayVariables } from './ifListToArray';
import { pushIfMessagePortVariables } from './ifMessagePort';
import { pushIfMicrophoneVariables } from './ifMicrophone';
import { pushIfPathVariables } from './ifPath';
import { pushIfProgramGuideVariables } from './ifProgramGuide';
import { pushIfRegionVariables } from './ifRegion';
import { pushIfRegistryVariables } from './ifRegistry';
import { pushIfRegistrySectionVariables } from './ifRegistrySection';
import { pushIfSGNodeBoundingRectVariables } from './ifSGNodeBoundingRect';
import { pushIfSGNodeChildrenVariables } from './ifSGNodeChildren';
import { pushIfSGNodeDictVariables } from './ifSGNodeDict';
import { pushIfSGNodeFieldVariables } from './ifSGNodeField';
import { pushIfSGNodeFocusVariables } from './ifSGNodeFocus';
import { pushIfSGNodeHttpAgentAccessVariables } from './ifSGNodeHttpAgentAccess';
import { pushIfSGScreenVariables } from './ifSGScreen';
import { pushIfSocketVariables } from './ifSocket';
import { pushIfSocketAddressVariables } from './ifSocketAddress';
import { pushIfSocketAsyncVariables } from './ifSocketAsync';
import { pushIfSocketCastOptionVariables } from './ifSocketCastOption';
import { pushIfSocketConnectionVariables } from './ifSocketConnection';
import { pushIfSocketConnectionOptionVariables } from './ifSocketConnectionOption';
import { pushIfSocketConnectionStatusVariables } from './ifSocketConnectionStatus';
import { pushIfSocketOptionVariables } from './ifSocketOption';
import { pushIfSocketStatusVariables } from './ifSocketStatus';
import { pushIfSourceIdentityVariables } from './ifSourceIdentity';
import { pushIfSpriteVariables } from './ifSprite';
import { pushIfStringVariables } from './ifString';
import { pushIfStringOpsVariables } from './ifStringOps';
import { pushIfTextToSpeechVariables } from './ifTextToSpeech';
import { pushIfTextureRequestVariables } from './ifTextureRequest';
import { pushIfTimeSpanVariables } from './ifTimeSpan';
import { pushIfToStrVariables } from './ifToStr';
import { pushIfUrlTransferVariables } from './ifUrlTransfer';
import { pushIfVideoPlayerVariables } from './ifVideoPlayer';
import { pushIfXMLElementVariables } from './ifXMLElement';
import { pushIfXMLListVariables } from './ifXMLList';
import { pushRoAppMemoryNotificationEventVariables } from './roAppMemoryNotificationEvent';
import { pushRoAudioPlayerEventVariables } from './roAudioPlayerEvent';
import { pushRoCECStatusEventVariables } from './roCECStatusEvent';
import { pushRoChannelStoreEventVariables } from './roChannelStoreEvent';
import { pushRoDeviceInfoEventVariables } from './roDeviceInfoEvent';
import { pushRoFileSystemEventVariables } from './roFileSystemEvent';
import { pushRoHdmiStatusEventVariables } from './roHdmiStatusEvent';
import { pushRoInputEventVariables } from './roInputEvent';
import { pushRoMicrophoneEventVariables } from './roMicrophoneEvent';
import { pushRoSGNodeEventVariables } from './roSGNodeEvent';
import { pushRoSGScreenEventVariables } from './roSGScreenEvent';
import { pushRoSocketEventVariables } from './roSocketEvent';
import { pushRoSystemLogEventVariables } from './roSystemLogEvent';
import { pushRoTextToSpeechEventVariables } from './roTextToSpeechEvent';
import { pushRoTextureRequestEventVariables } from './roTextureRequestEvent';
import { pushRoUniversalControlEventVariables } from './roUniversalControlEvent';
import { pushRoUrlEventVariables } from './roUrlEvent';
import { pushRoVideoPlayerEventVariables } from './roVideoPlayerEvent';


export {
    pushCustomVariableToContainer,

    pushIfAppInfoVariables,
    pushIfAppManagerVariables,
    pushIfAppMemoryMonitorVariables,
    pushIfArrayVariables,
    pushIfAudioMetadataVariables,
    pushIfAudioResourceVariables,
    pushIfByteArrayVariables,
    pushIfCECStatusVariables,
    pushIfChannelStoreVariables,
    pushIfDateTimeVariables,
    pushIfDeviceInfoVariables,
    pushIfDraw2DVariables,
    pushIfEnumVariables,
    pushIfFileSystemVariables,
    pushIfFontVariables,
    pushIfFontRegistryVariables,
    pushIfGetMessagePortVariables,
    pushIfHdmiStatusVariables,
    pushIfHttpAgentVariables,
    pushIfImageMetadataVariables,
    pushIfInputVariables,
    pushIfListVariables,
    pushIfListToArrayVariables,
    pushIfMessagePortVariables,
    pushIfMicrophoneVariables,
    pushIfPathVariables,
    pushIfProgramGuideVariables,
    pushIfRegionVariables,
    pushIfRegistryVariables,
    pushIfRegistrySectionVariables,
    pushIfSGNodeBoundingRectVariables,
    pushIfSGNodeChildrenVariables,
    pushIfSGNodeDictVariables,
    pushIfSGNodeFieldVariables,
    pushIfSGNodeFocusVariables,
    pushIfSGNodeHttpAgentAccessVariables,
    pushIfSGScreenVariables,
    pushIfSocketVariables,
    pushIfSocketAddressVariables,
    pushIfSocketAsyncVariables,
    pushIfSocketCastOptionVariables,
    pushIfSocketConnectionVariables,
    pushIfSocketConnectionOptionVariables,
    pushIfSocketConnectionStatusVariables,
    pushIfSocketOptionVariables,
    pushIfSocketStatusVariables,
    pushIfSourceIdentityVariables,
    pushIfSpriteVariables,
    pushIfStringVariables,
    pushIfStringOpsVariables,
    pushIfTextToSpeechVariables,
    pushIfTextureRequestVariables,
    pushIfTimeSpanVariables,
    pushIfToStrVariables,
    pushIfUrlTransferVariables,
    pushIfVideoPlayerVariables,
    pushIfXMLElementVariables,
    pushIfXMLListVariables,

    pushRoAppMemoryNotificationEventVariables,
    pushRoAudioPlayerEventVariables,
    pushRoCECStatusEventVariables,
    pushRoChannelStoreEventVariables,
    pushRoDeviceInfoEventVariables,
    pushRoFileSystemEventVariables,
    pushRoHdmiStatusEventVariables,
    pushRoInputEventVariables,
    pushRoMicrophoneEventVariables,
    pushRoSGNodeEventVariables,
    pushRoSGScreenEventVariables,
    pushRoSocketEventVariables,
    pushRoSystemLogEventVariables,
    pushRoTextToSpeechEventVariables,
    pushRoTextureRequestEventVariables,
    pushRoUniversalControlEventVariables,
    pushRoUrlEventVariables,
    pushRoVideoPlayerEventVariables
};
