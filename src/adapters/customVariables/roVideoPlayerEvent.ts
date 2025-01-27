import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rovideoplayerevent.md
export function pushRoVideoPlayerEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {

    pushCustomVariableToContainer(container, {
        name: '$paused',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isPaused()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$listitemselected',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isListItemSelected()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$formatDetected',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isFormatDetected()`,
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
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$requestfailed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isRequestFailed()`,
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
        name: '$segmentdownloadstarted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isSegmentDownloadStarted()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$streamstarted',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isStreamStarted()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$statusmessage',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isStatusMessage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$fullresult',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isFullResult()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$resumed',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isResumed()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$captionmodechanged',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isCaptionModeChanged()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timedmetadata',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isTimedMetaData()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$playbackposition',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isPlaybackPosition()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$streamsegmentinfo',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isStreamSegmentInfo()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$downloadsegmentinfo',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isDownloadSegmentInfo()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$requestsucceeded',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.isRequestSucceeded()`,
        lazy: true,
        value: '',
        children: []
    });
}
