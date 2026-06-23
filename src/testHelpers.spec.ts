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
 * List every path remaining inside `dir` (recursively), sorted. Used to show what is still present
 * when a directory delete fails.
 */
function listDirContents(dir: string): string[] {
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
 * Delete a directory, retrying a few times to get past transient locks (most often a Windows file
 * handle still held open by an earlier test). If every attempt fails, log the paths still present
 * along with a stack trace so CI shows which leftovers blocked the delete, then re-throw the final error.
 * @param dir the directory to delete
 * @param options.retryCount how many times to attempt the delete before giving up (defaults to 1)
 * @param options.label optional label included in the diagnostic output to identify the calling teardown
 */
export function forceDeleteDir(dir: string, options?: { retryCount?: number; label?: string }) {
    const retryCount = options?.retryCount ?? 1;
    const prefix = options?.label ? `[forceDeleteDir ${options.label}]` : '[forceDeleteDir]';
    let lastError: Error;
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            fsExtra.removeSync(dir);
            return;
        } catch (error) {
            lastError = error as Error;
        }
    }
    const leftovers = listDirContents(dir);
    console.error(`${prefix} failed to delete '${dir}' after ${retryCount} attempt(s); ${leftovers.length} path(s) still present:`);
    for (const leftover of leftovers) {
        console.error(`${prefix}   ${leftover}`);
    }
    console.error(`${prefix} ${lastError.message}`);
    if (lastError.stack) {
        console.error(lastError.stack);
    }
    throw lastError;
}

beforeEach(() => {
    forceDeleteDir(tempDir);
    fsExtra.ensureDirSync(tempDir);
});

afterEach(() => {
    forceDeleteDir(tempDir);
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
