import { expect } from 'chai';
import dedent = require('dedent');
import * as fsExtra from 'fs-extra';
import { SmartBuffer } from 'smart-buffer';
import { bscProjectWorkerPool } from './bsc/threading/BscProjectWorkerPool';
import { DisallowedFunctionIdentifiersText, standardizePath as s } from 'brighterscript';

export const tempDir = s`${__dirname}/../.tmp`;
export const rootDir = s`${tempDir}/rootDir`;
export const stagingDir = s`${tempDir}/stagingDir`;

/**
 * List every path remaining inside `dir` (recursively).
 */
function listTempLeftovers(dir: string): string[] {
    const result: string[] = [];
    const walk = (current: string) => {
        let entries: string[];
        try {
            entries = fsExtra.readdirSync(current);
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = `${current}/${entry}`;
            result.push(fullPath);
            try {
                if (fsExtra.statSync(fullPath).isDirectory()) {
                    walk(fullPath);
                }
            } catch {
                //entry may have been removed concurrently; ignore
            }
        }
    };
    walk(dir);
    return result.sort();
}

/**
 * Run a temp-dir cleanup operation. If it throws (most often Windows `ENOTEMPTY`, which happens when an
 * earlier test left a file or handle open in the shared temp dir), log exactly what is still present so CI
 * tells us which leftovers locked the dir, then re-throw. This diagnoses the failure; it does not hide it.
 */
function cleanupTempDir(label: string, dir: string, action: () => void) {
    try {
        action();
    } catch (error) {
        const leftovers = listTempLeftovers(dir);
        console.error(`[temp-teardown] ${label}: ${(error as Error).message}`);
        console.error(`[temp-teardown] ${label}: ${leftovers.length} path(s) still present under ${dir}:`);
        for (const leftover of leftovers) {
            console.error(`[temp-teardown]   ${leftover}`);
        }
        throw error;
    }
}

/**
 * `fsExtra.removeSync` for a temp dir, with diagnostics logged if the removal fails.
 */
export function removeTempDir(dir: string, label: string) {
    cleanupTempDir(label, dir, () => fsExtra.removeSync(dir));
}

/**
 * `fsExtra.emptyDirSync` for a temp dir, with diagnostics logged if the empty fails.
 */
export function emptyTempDir(dir: string, label: string) {
    cleanupTempDir(label, dir, () => fsExtra.emptyDirSync(dir));
}

beforeEach(() => {
    emptyTempDir(tempDir, 'global beforeEach');
});

afterEach(() => {
    removeTempDir(tempDir, 'global afterEach');
});

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

export function expectThrows(callback: () => any, expectedMessage = undefined, failedTestMessage = 'Expected to throw but did not') {
    let wasExceptionThrown = false;
    try {
        callback();
    } catch (e) {
        wasExceptionThrown = true;
        if (expectedMessage) {
            expect(e.message).to.eql(expectedMessage);
        }
    }
    if (wasExceptionThrown === false) {
        throw new Error(failedTestMessage);
    }
}
export async function expectThrowsAsync(callback: () => any, expectedMessage = undefined, failedTestMessage = 'Expected to throw but did not') {
    let wasExceptionThrown = false;
    try {
        await Promise.resolve(callback());
    } catch (e) {
        wasExceptionThrown = true;
        if (expectedMessage) {
            expect(e.message).to.eql(expectedMessage);
        }
    }
    if (wasExceptionThrown === false) {
        throw new Error(failedTestMessage);
    }
}

//tear down all threads at the end of our entire test suite
after(() => {
    bscProjectWorkerPool.dispose();
});
