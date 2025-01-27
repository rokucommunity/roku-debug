import { VariableType } from '../../debugProtocol/events/responses/VariablesResponse';
import type { DebugProtocolAdapter, EvaluateContainer } from '../DebugProtocolAdapter';
import { pushCustomVariableToContainer } from './utils';

// https://developer.roku.com/docs/references/brightscript/interfaces/ifdatetime.md
export function pushIfDateTimeVariables(adapter: DebugProtocolAdapter, expression: string, container: EvaluateContainer) {
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
