import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/events/rovideoplayerevent.md
export function pushRoVideoPlayerEventVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {

    pushCustomVariableToContainer(container, {
        name: '$isPaused',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsPaused()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isListItemSelected',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsListItemSelected()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isFormatDetected',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsFormatDetected()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$message',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMessage()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$info',
        type: VariableType.AssociativeArray,
        presentationHint: { kind: 'virtual' },
        evaluateName: `${expression}.GetInfo()`,
        value: VariableType.AssociativeArray,
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRequestFailed',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsRequestFailed()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$index',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetIndex()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isSegmentDownloadStarted',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsSegmentDownloadStarted()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStreamStarted',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsStreamStarted()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStatusMessage',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsStatusMessage()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isFullResult',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsFullResult()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isResumed',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsResumed()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isCaptionModeChanged',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsCaptionModeChanged()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isTimedMetaData',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsTimedMetaData()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isPlaybackPosition',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsPlaybackPosition()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isStreamSegmentInfo',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsStreamSegmentInfo()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isDownloadSegmentInfo',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsDownloadSegmentInfo()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$isRequestSucceeded',
        type: VariableType.Boolean,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.IsRequestSucceeded()`,
        value: '',
        children: []
    });
}
