import dedent = require('dedent');

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
