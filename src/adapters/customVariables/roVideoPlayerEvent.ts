import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rovideoplayerevent.md
export function pushRoVideoPlayerEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {

    pushCustomVariableToContainer(container, {
        name: '$isPaused',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsPaused()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isListItemSelected',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsListItemSelected()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isFormatDetected',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsFormatDetected()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$message',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetMessage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$info',
        type: VariableType.AssociativeArray,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRequestFailed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRequestFailed()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$index',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetIndex()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isSegmentDownloadStarted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsSegmentDownloadStarted()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStreamStarted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsStreamStarted()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStatusMessage',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsStatusMessage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isFullResult',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsFullResult()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isResumed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsResumed()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isCaptionModeChanged',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsCaptionModeChanged()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isTimedMetaData',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsTimedMetaData()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isPlaybackPosition',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsPlaybackPosition()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStreamSegmentInfo',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsStreamSegmentInfo()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isDownloadSegmentInfo',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsDownloadSegmentInfo()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRequestSucceeded',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsRequestSucceeded()`,
        lazy: true,
        value: '',
        children: []
    });
}
