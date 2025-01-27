import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/en-ca/docs/references/brightscript/interfaces/iftexttospeech.md
export function pushIfTextToSpeechVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$isEnabled',
        type: VariableType.Boolean,
        presentationHint: 'virtual',
        evaluateName: `${expression}.IsEnabled()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$availableLanguages',
        type: VariableType.List,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAvailableLanguages()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$language',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetLanguage()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$availableVoices',
        type: VariableType.List,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetAvailableVoices()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$voice',
        type: VariableType.String,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVoice()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$volume',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetVolume()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$rate',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetRate()`,
        lazy: true,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$pitch',
        type: VariableType.Integer,
        presentationHint: 'virtual',
        evaluateName: `${expression}.GetPitch()`,
        lazy: true,
        value: '',
        children: []
    });
}
