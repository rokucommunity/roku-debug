import { expect } from 'chai';
import dedent = require('dedent');
import { SmartBuffer } from 'smart-buffer';

/**
 * Forces all line endings to \n
 */
export function standardizeLineEndings(strings: string | string[], ...expressions: any[]) {
    const stringParts = typeof strings === 'string' ? [strings] : strings;
    let result = [];
    for (let i = 0; i < stringParts.length; i++) {
        result.push(stringParts[i], expressions[i]);
    }
    return result.join('').replace(/(\r?\n)+/g, '\n');
}

/**
 * Make line endings the same, and dedent
 */
export function clean(...args);
export function clean(strings: TemplateStringsArray, ...expressions: any) {
    let result = standardizeLineEndings(strings as any, ...expressions ?? []);
    result = dedent(result);
    return result;
}

/**
 * Take only the properties from `subject` that are present on `pattern`
 */
export function pick(subject: Record<string, any>, pattern: Record<string, any>) {
    if (!subject) {
        return subject;
    }
    let keys = Object.keys(pattern ?? {});
    //if there were no keys provided, use some sane defaults
    keys = keys.length > 0 ? keys : ['message', 'code', 'range', 'severity'];

    //copy only compare the specified keys from actualDiagnostic
    const clone = {};
    for (const key of keys) {
        clone[key] = subject[key];
    }
    return clone;
}

/**
 * For every item in `patterns`, pick those properties from the item at the corresponding index in `subjects`
 */
export function pickArray(subjects: any[], patterns: any[]) {
    subjects = [...subjects];
    for (let i = 0; i < patterns.length; i++) {
        if (subjects[i]) {
            subjects[i] = pick(subjects[i], patterns[i]);
        }
    }
    return subjects;
}

export function expectPickEquals(subjects: any[], patterns: any[]) {
    expect(
        pickArray(subjects, patterns)
    ).to.eql(
        patterns
    );
}

/**
 * Build a buffer of `byteCount` size and fill it with random data
 */
export function getRandomBuffer(byteCount: number) {
    const result = new SmartBuffer();
    for (let i = 0; i < byteCount; i++) {
        result.writeUInt8(i);
    }
    return result.toBuffer();
}
