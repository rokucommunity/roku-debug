import { createSandbox } from 'sinon';
import { standardizePath as s } from './FileUtils';
import undent from 'undent';
export let sinon = createSandbox();

export const tmpDir = s`${process.cwd()}/.tmp`;
export const outDir = s`${tmpDir}/outDir`;
export const stagingDir = s`${tmpDir}/stagingDir`;
export const rootDir = s`${tmpDir}/rootDir`;
export const sourceDirChild = s`${tmpDir}/sourceDirChild`;
export const sourceDirParent = s`${tmpDir}/sourceDirParent`;
export const sourceDirGrandparent = s`${tmpDir}/sourceDirGrandparent`;
export const sourceDirs = [
    sourceDirChild,
    sourceDirParent,
    sourceDirGrandparent
];

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
    result = undent(result);
    return result;
}
