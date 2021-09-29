import { expect } from 'chai';
import { rootDir } from '../testHelpers.spec';
import { standardizePath as s } from '../FileUtils';
import { BpMap, BreakpointQueue } from './BreakpointQueue';
import type { QueueBreakpoint } from './BreakpointQueue';

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

    it('adds and deletes system breakpoints', () => {
        const systemBp1 = { line: 100, column: 0 };
        const systemBp2 = { line: 200, column: 0 };
        //set a regular breakpoint
        queue.setBreakpoints(mainPath, [bp1]);
        expectBreakpoints(mainPath, [bp1]);

        //set a system breakpoint
        queue.setSystemBreakpoint(mainPath, systemBp1);
        queue.setSystemBreakpoint(mainPath, systemBp2);
        //should have the regular AND system breakpoint
        expectBreakpoints(mainPath, [bp1, systemBp1, systemBp2]);

        //set regular breakpoints
        queue.setBreakpoints(mainPath, [bp3]);
        //should have the regular bp and the previous system breakpoint
        expectBreakpoints(mainPath, [bp3, systemBp1, systemBp2]);

        //delets system breakpoints
        queue.deleteSystemBreakpoint(mainPath, systemBp2);
        expectBreakpoints(mainPath, [bp3, systemBp1]);
    });

    it('adds system breakpoint first', () => {
        const systemBp = { line: 100, column: 0 };
        queue.setSystemBreakpoint(mainPath, systemBp);
        expectBreakpoints(mainPath, [systemBp]);
        queue.setBreakpoints(mainPath, [bp1]);
        expectBreakpoints(mainPath, [bp1, systemBp]);
    });

    it('does not crash when deleting unknown system breakpoint', () => {
        queue.deleteSystemBreakpoint(mainPath, { line: 1 });
    });

    it('defaults line number to 0 when missing', () => {
        delete bp1.line;
        queue.setBreakpoints(mainPath, [bp1]);
        expect(bp1.line).to.equal(0);
    });

    it('BpMap transforms key', () => {
        const map = new BpMap();
        const upperPath = 'C:/PROJECTS/file.brs';
        const lowerPath = upperPath.toLowerCase();
        map.set(upperPath, []);
        expect(map.get(upperPath)).to.exist;
        expect(map.get(lowerPath)).to.exist;
        map.delete(lowerPath);
        expect(map.get(lowerPath)).not.to.exist;
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
});
