import { expect } from 'chai';
import { rootDir } from '../testHelpers.spec';
import { standardizePath as s } from '../FileUtils';
import type { QueueBreakpoint } from './BreakpointQueue';
import { BreakpointQueue } from './BreakpointQueue';

describe.only('BreakpointQueue', () => {
    const mainPath = s`${rootDir}/source/main.brs`;

    const [bp1, bp2, bp3, bp4, bp5] = [{
        line: 1
    }, {
        line: 2
    }, {
        line: 3
    }, {
        line: 4
    }, {
        line: 5
    }] as QueueBreakpoint[];

    let queue: BreakpointQueue;
    beforeEach(() => {
        queue = new BreakpointQueue();
    });

    it('adds breakpoints', () => {
        queue.setBreakpoints(mainPath, [bp1, bp2] as any);
        expectBreakpoints(mainPath, [bp1, bp2]);
        queue.setBreakpoints(mainPath, [bp3] as any);
        expectBreakpoints(mainPath, [bp3]);
    });

    it('prevents duplicates', () => {
        queue.setBreakpoints(mainPath, [bp1, { line: 3 }, bp3] as any);
        //should not have dupes
        expectBreakpoints(mainPath, [bp1, bp3]);
    });

    it('sets id for repeat breakpoints', () => {
        queue.setBreakpoints(mainPath, [bp1]);
        const [bp1New] = queue.setBreakpoints(mainPath, [{ line: 1 }]);
        expect(bp1.id).to.be.greaterThan(0);
        expect(bp1New.id).to.eql(bp1.id);
    });

    it('injects system breakpoints', () => {
        const systemBp = { line: 100, column: 0 };
        //set a regular breakpoint
        queue.setBreakpoints(mainPath, [bp1]);
        expectBreakpoints(mainPath, [bp1]);

        //set a system breakpoint
        queue.setSystemBreakpoint(mainPath, systemBp);
        //should have the regular AND system breakpoint
        expectBreakpoints(mainPath, [bp1, systemBp]);

        //flush
        queue.flush();

        //should have no breakpoints
        expectBreakpoints();

        //set regular breakpoints
        queue.setBreakpoints(mainPath, [bp3]);
        //should have the regular bp and the previous system breakpoint
        expectBreakpoints(mainPath, [bp3, systemBp]);
    });

    describe.only('diff', () => {
        const fileKey = s`${mainPath}`.toLowerCase();

        it('properly calculates diffs', () => {
            queue.setBreakpoints(mainPath, [bp1, bp2]);
            expectDiff({
                added: {
                    [fileKey]: [bp1, bp2]
                }
            });

            queue.setBreakpoints(mainPath, [bp1, bp3]);

            expectDiff({
                deleted: {
                    [fileKey]: [bp2]
                },
                added: {
                    [fileKey]: [bp3]
                }
            });

            //gets cleaned out when called again
            expectDiff({});
        });

        it('system breakpoints show in diff', () => {
            queue.setBreakpoints(mainPath, [bp1, bp2]);
            //flush current breakpoints
            queue.diff();
            queue.setSystemBreakpoint(mainPath, bp3);
            expectDiff({
                added: {
                    [fileKey]: [bp3]
                }
            });
            queue.deleteSystemBreakpoint(mainPath, bp3);
            expectDiff({});
        });
    });

    function expectBreakpoints(...args: Array<string | Partial<QueueBreakpoint>[]>) {
        const expected = {};
        for (let i = 0; i < args.length; i += 2) {
            const srcPath = args[i] as string;
            const breakpoints = args[i + 1] as QueueBreakpoint[];
            expected[s`${srcPath}`.toLowerCase()] = breakpoints.map(x => ({
                line: x.line,
                column: x.column
            }));
        }
        const actual = {};
        for (const [srcPath, breakpoints] of queue['breakpoints']) {
            actual[srcPath] = breakpoints.map(x => ({
                line: x.line,
                column: x.column
            }));
        }

        expect(actual).to.eql(expected);
    }

    interface TestDiff {
        deleted?: Record<string, Partial<QueueBreakpoint>[]>;
        added?: Record<string, Partial<QueueBreakpoint>[]>;
    }

    function expectDiff(expectedDiff: TestDiff) {
        sanitize(expectedDiff, 'added');
        sanitize(expectedDiff, 'deleted');

        const actualDiff = queue.diff();
        const actualTestDiff = {
            added: Object.fromEntries(actualDiff.added),
            deleted: Object.fromEntries(actualDiff.deleted)
        };
        sanitize(actualTestDiff, 'added');
        sanitize(actualTestDiff, 'deleted');

        expect(expectedDiff).to.eql(actualTestDiff);

        function sanitize(source: TestDiff, type: 'added' | 'deleted') {
            //ensure target and expected both exist
            source[type] = source[type] ?? {};

            for (const key of Object.keys(source[type] ?? {})) {
                const data = (source[type][key] ?? []).map(x => ({
                    line: x.line,
                    column: x.column
                }));
                if (data.length > 0) {
                    source[type][key] = data;
                } else {
                    delete source[type][key];
                }
                if (Object.keys(source[type]).length === 0) {
                    delete source[type];
                }
            }
            if (Object.keys(source?.[type] ?? {}).length === 0) {
                delete source[type];
            }
        }
    }
});
