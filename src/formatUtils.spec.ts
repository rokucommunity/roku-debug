import { expect } from 'chai';
import { formatLogDate, replaceLast, serializeError } from './formatUtils';

/**
 * `serialize-error` is no longer a dependency -- this module replaced it. When a copy still
 * happens to be present in node_modules (from an install predating its removal), every
 * `expectMatchesPackage` assertion additionally diffs our output against the real package.
 * Once it is gone those comparisons are skipped and the explicit assertions still stand.
 */
let referenceSerializeError: ((value: unknown) => unknown) | undefined;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    referenceSerializeError = require('serialize-error').serializeError;
} catch {
    referenceSerializeError = undefined;
}

/**
 * `serialize-error` copies `name`/`message`/`stack` as NON-enumerable properties, so a plain
 * `deep.equal` against our (enumerable) output fails on shape alone. Round-tripping both sides
 * through JSON compares what actually reaches the log message, which is the only thing that
 * matters at our call sites.
 */
function asJson(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null));
}

function expectMatchesPackage(value: unknown) {
    if (!referenceSerializeError) {
        return;
    }
    expect(asJson(serializeError(value))).to.eql(asJson(referenceSerializeError(value)));
}

describe('formatUtils', () => {
    describe('serializeError', () => {
        it('matches the package for a plain Error', () => {
            expectMatchesPackage(new Error('something broke'));
        });

        it('retains message and stack', () => {
            const result = serializeError(new Error('something broke')) as Record<string, unknown>;
            expect(result.message).to.eql('something broke');
            expect(result.name).to.eql('Error');
            expect(result.stack).to.be.a('string').and.contain('something broke');
        });

        it('matches the package for a custom error with extra props', () => {
            const error = Object.assign(new Error('enoent-ish'), { code: 'ENOENT', path: '/tmp/nope' });
            expectMatchesPackage(error);
            expect(asJson(serializeError(error))).to.include({ code: 'ENOENT', path: '/tmp/nope' });
        });

        it('serializes a nested `cause` chain', () => {
            const root = new Error('root cause');
            const wrapper = new Error('outer', { cause: root });
            //deliberately NOT compared against the package: `cause` is non-enumerable, so
            //`serialize-error` drops the chain entirely. We keep it -- it is the useful part.
            const result = asJson(serializeError(wrapper));
            expect(result.message).to.eql('outer');
            expect(result.cause.message).to.eql('root cause');
            expect(result.cause.stack).to.be.a('string');
        });

        it('serializes a multi-level `cause` chain', () => {
            const root = new Error('level 3');
            const middle = new Error('level 2', { cause: root });
            const top = new Error('level 1', { cause: middle });
            const result = asJson(serializeError(top));
            expect(result.cause.cause.message).to.eql('level 3');
        });

        it('handles a non-Error `cause`', () => {
            const result = asJson(serializeError(new Error('outer', { cause: 'just a string' })));
            expect(result.cause).to.eql('just a string');
        });

        it('handles a circular `cause`', () => {
            const error: any = new Error('self-caused');
            Object.defineProperty(error, 'cause', { value: error, configurable: true, writable: true });
            expect(() => serializeError(error)).to.not.throw();
            expect(asJson(serializeError(error)).cause).to.eql('[Circular]');
        });

        it('honors maxDepth for the `cause` chain', () => {
            const root = new Error('level 3');
            const middle = new Error('level 2', { cause: root });
            const top = new Error('level 1', { cause: middle });
            const result = asJson(serializeError(top, { maxDepth: 1 }));
            expect(result.message).to.eql('level 1');
            expect(result.cause.cause).to.eql(undefined);
        });

        it('digs an Error out of a plain wrapper object', () => {
            const value = { context: 'launching', err: new Error('inner boom') };
            expectMatchesPackage(value);
            //the whole point: the inner message survives rather than stringifying to {}
            const result = asJson(serializeError(value));
            expect(result.err.message).to.eql('inner boom');
            expect(result.err.stack).to.be.a('string');
        });

        it('digs Errors out of an array', () => {
            const value = [new Error('first'), new Error('second')];
            expectMatchesPackage(value);
            const result = asJson(serializeError(value));
            expect(result).to.be.an('array').with.lengthOf(2);
            expect(result.map((x: any) => x.message)).to.eql(['first', 'second']);
        });

        it('replaces circular references instead of recursing forever', () => {
            const error: any = new Error('cyclic');
            error.self = error;
            expectMatchesPackage(error);
            expect(asJson(serializeError(error)).self).to.eql('[Circular]');
        });

        it('handles a cycle through a plain object', () => {
            const error: any = new Error('cyclic-ctx');
            error.ctx = { name: 'ctx' };
            error.ctx.self = error.ctx;
            expectMatchesPackage(error);
            expect(asJson(serializeError(error)).ctx.self).to.eql('[Circular]');
        });

        it('serializes a sibling repeated reference twice rather than marking it circular', () => {
            const shared = { id: 1 };
            const value = { a: shared, b: shared };
            expectMatchesPackage(value);
            const result = asJson(serializeError(value));
            expect(result.b).to.eql({ id: 1 });
        });

        it('does not blow the stack on a deep non-cyclic chain', () => {
            const root: any = {};
            let node = root;
            for (let i = 0; i < 1000; i++) {
                node.child = {};
                node = node.child;
            }
            node.message = 'bottom';
            expect(() => serializeError(root)).to.not.throw();
        });

        it('honors maxDepth', () => {
            const value = { a: { b: { c: 'deep' } } };
            expect(asJson(serializeError(value, { maxDepth: 1 }))).to.eql({ a: {} });
        });

        it('counts depth by true nesting rather than across siblings', () => {
            //four shallow siblings must all survive a maxDepth of 2
            const value = { a: { x: 1 }, b: { x: 2 }, c: { x: 3 }, d: { x: 4 } };
            expect(asJson(serializeError(value, { maxDepth: 2 }))).to.eql(value);
        });

        it('matches the package for non-object values', () => {
            for (const value of ['just a string', 42, null, undefined, false]) {
                expectMatchesPackage(value);
                expect(serializeError(value)).to.eql(value);
            }
        });

        it('describes a thrown function', () => {
            function boom() { }
            expect(serializeError(boom)).to.eql('[Function: boom]');
            expect(serializeError(() => { })).to.be.a('string').and.contain('[Function:');
        });

        it('drops function-valued properties', () => {
            const error = Object.assign(new Error('with fn'), { handler: () => { } });
            expectMatchesPackage(error);
            expect(asJson(serializeError(error))).to.not.have.property('handler');
        });

        it('summarizes Buffers', () => {
            const error = Object.assign(new Error('with buffer'), { payload: Buffer.from('hello') });
            expectMatchesPackage(error);
            expect(asJson(serializeError(error)).payload).to.eql('[object Buffer]');
        });

        it('honors toJSON', () => {
            const value = { secret: 'hidden', toJSON: () => ({ safe: 'shown' }) };
            expectMatchesPackage(value);
            expect(asJson(serializeError(value))).to.eql({ safe: 'shown' });
        });
    });

    describe('replaceLast', () => {
        it('replaces only the final occurrence', () => {
            expect(replaceLast('a.b.c', '.', '/')).to.eql('a.b/c');
        });

        it('returns the text unchanged when the pattern is absent', () => {
            expect(replaceLast('abc', 'z', '/')).to.eql('abc');
        });

        it('appends when the pattern is empty', () => {
            expect(replaceLast('abc', '', '!')).to.eql('abc!');
        });
    });

    describe('formatLogDate', () => {
        it('formats with zero-padding and the ratio separator', () => {
            expect(formatLogDate(new Date(2024, 0, 2, 3, 4, 5))).to.eql('2024-01-02T03∶04∶05');
        });
    });
});
