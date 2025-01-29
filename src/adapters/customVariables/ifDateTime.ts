import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifdatetime.md
export function pushIfDateTimeVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
    pushCustomVariableToContainer(container, {
        name: '$timeZoneOffset',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetTimeZoneOffset()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$seconds',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.AsSeconds()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$secondsLong',
        type: VariableType.LongInteger,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.AsSecondsLong()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$iso',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.ToISOString()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$dateLocalized',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.asDateStringLoc("full")`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$timeLocalized',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.asTimeStringLoc("short")`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$date',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.AsDateStringNoParam()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$year',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetYear()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$month',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMonth()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$dayOfMonth',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDayOfMonth()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$hours',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetHours()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$minutes',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMinutes()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$seconds',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetSeconds()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$milliseconds',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetMilliseconds()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$lastDayOfMonth',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetLastDayOfMonth()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$dayOfWeek',
        type: VariableType.Integer,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetDayOfWeek()`,
        value: '',
        children: []
    });

    pushCustomVariableToContainer(container, {
        name: '$weekday',
        type: VariableType.String,
        presentationHint: { kind: 'virtual', lazy: true },
        evaluateName: `${expression}.GetWeekday()`,
        value: '',
        children: []
    });
}
