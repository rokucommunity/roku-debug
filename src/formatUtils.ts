/**
 * Small dependency-free string/date helpers.
 *
 * This module intentionally imports nothing else from the project so it can be
 * safely used from low-level files (logging, trackers) without creating import cycles.
 */

/**
 * Left-pad a number with zeros to the specified width
 */
function pad(value: number, width = 2) {
    return value.toString().padStart(width, '0');
}

/**
 * Format a date as `yyyy-mm-dd"T"HH∶MM∶ss` using local time.
 *
 * Note the separator between the time parts is U+2236 (RATIO), not a colon -- these
 * strings are used in log *filenames*, and `:` is not a legal filename character on windows.
 *
 * Replaces the `dateformat` package, which was used for this single format string.
 */
export function formatLogDate(date: Date) {
    return [
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        'T',
        `${pad(date.getHours())}∶${pad(date.getMinutes())}∶${pad(date.getSeconds())}`
    ].join('');
}

/**
 * Replace the LAST occurrence of `pattern` in `text` with `replacement`.
 * Returns `text` unchanged when `pattern` is not found.
 *
 * Replaces the `replace-last` package. Mirrors that package's string behavior,
 * including the empty-pattern case (`lastIndexOf('')` returns `text.length`, so the
 * replacement is appended).
 */
export function replaceLast(text: string, pattern: string, replacement: string) {
    const index = text.lastIndexOf(pattern);
    if (index < 0) {
        return text;
    }
    return text.substring(0, index) + replacement + text.substring(index + pattern.length);
}

/**
 * The standard Error properties worth copying. `name`/`message`/`stack` are non-enumerable
 * on Error instances, so `Object.entries` never sees them and they must be copied explicitly.
 */
const errorCommonProperties = ['name', 'message', 'stack', 'code'];

/**
 * Recursively copy `from` into a plain object/array, converting anything that would
 * not survive `JSON.stringify` and replacing already-visited references with `[Circular]`.
 *
 * `seen` is copied for each branch rather than shared, so a value referenced twice at
 * sibling positions is serialized both times -- only a true ancestor cycle is `[Circular]`.
 */
function destroyCircular(from: Record<string, unknown>, seen: unknown[], depth: number, maxDepth: number) {
    const to: Record<string, unknown> = Array.isArray(from) ? [] as unknown as Record<string, unknown> : {};
    seen.push(from);

    if (depth >= maxDepth) {
        return to;
    }

    if (typeof from.toJSON === 'function') {
        return (from as { toJSON(): unknown }).toJSON();
    }

    for (const [key, value] of Object.entries(from)) {
        if (typeof Buffer === 'function' && Buffer.isBuffer(value)) {
            to[key] = '[object Buffer]';
        } else if (typeof value === 'function') {
            //JSON.stringify discards functions, so we do too
            continue;
        } else if (!value || typeof value !== 'object') {
            to[key] = value;
        } else if (!seen.includes(value)) {
            to[key] = destroyCircular(value as Record<string, unknown>, seen.slice(), depth + 1, maxDepth);
        } else {
            to[key] = '[Circular]';
        }
    }

    for (const property of errorCommonProperties) {
        if (typeof from[property] === 'string') {
            to[property] = from[property];
        }
    }

    //`cause` is non-enumerable on Error, so the loop above never sees it. Serialize it
    //explicitly -- an error's cause chain is usually the most useful part of the report.
    //(`serialize-error` drops the chain entirely; this is a deliberate improvement on it.)
    if (from instanceof Error && from.cause !== undefined && to.cause === undefined) {
        const cause = from.cause;
        if (!cause || typeof cause !== 'object') {
            to.cause = cause;
        } else if (seen.includes(cause)) {
            to.cause = '[Circular]';
        } else if (depth < maxDepth) {
            to.cause = destroyCircular(cause as Record<string, unknown>, seen.slice(), depth + 1, maxDepth);
        }
    }

    return to;
}

/**
 * Convert an unknown thrown value into a plain JSON-serializable object. Walks nested
 * objects and arrays (so an Error nested inside a plain wrapper object still yields its
 * `message`/`stack`), handles circular references, and returns primitives as-is.
 *
 * Replaces the `serialize-error` package, with two deliberate improvements on it:
 * - `cause` chains are serialized (the package drops them, since `cause` is non-enumerable)
 * - the depth counter tracks true nesting rather than being shared across siblings
 *
 * `maxDepth` defaults to unlimited, matching the package -- pass one when serializing
 * values of unknown shape.
 */
export function serializeError(value: unknown, options: { maxDepth?: number } = {}) {
    const { maxDepth = Number.POSITIVE_INFINITY } = options;

    if (typeof value === 'object' && value !== null) {
        return destroyCircular(value as Record<string, unknown>, [], 0, maxDepth);
    }

    //people sometimes throw things besides Error objects
    if (typeof value === 'function') {
        return `[Function: ${(value as { name?: string }).name || 'anonymous'}]`;
    }

    return value;
}
