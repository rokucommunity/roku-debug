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
 * Convert an unknown thrown value into a plain JSON-serializable object.
 * Handles circular references, and non-Error values are returned as-is.
 *
 * Replaces the `serialize-error` package, which was used in a single log message.
 */
export function serializeError(value: unknown) {
    if (!(value instanceof Error)) {
        return value;
    }
    const seen = new WeakSet();
    const convert = (error: Error) => {
        const result: Record<string, unknown> = {};
        //Error's own enumerable props plus the standard non-enumerable ones
        for (const key of ['name', 'message', 'stack', 'code', ...Object.keys(error)]) {
            const item = (error as unknown as Record<string, unknown>)[key];
            if (item === undefined || typeof item === 'function') {
                continue;
            }
            if (item instanceof Error) {
                if (seen.has(item)) {
                    result[key] = '[Circular]';
                } else {
                    seen.add(item);
                    result[key] = convert(item);
                }
            } else {
                result[key] = item;
            }
        }
        return result;
    };
    seen.add(value);
    return convert(value);
}
