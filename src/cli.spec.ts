import { expect } from 'chai';
import { execSync } from 'child_process';

describe('cli', () => {
    it('runs without crashing and includes summary', function() {
        this.timeout(30_000);
        expect(
            execSync('npx ts-node src/cli.ts --help').toString()
        ).to.include('roku-debug, support for debugging Roku devices via telnet or debug protocol');
    });
});
