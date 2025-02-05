import { ProgramBuilder, util as bscUtil } from 'brighterscript';
import type { MaybePromise } from '../interfaces';

/**
 * Class that wraps the BrighterScript ProgramBuilder
 */
export class BscProject {
    private programBuilder: ProgramBuilder;

    /**
     * Activate the ProgramBuilder and run it (using any options provided)
     * @param options
     */
    public async activate(options: Parameters<ProgramBuilder['run']>[0]) {
        this.programBuilder = new ProgramBuilder();
        await this.programBuilder.run(options);
    }

    /**
     * Get all of the functions available for all scopes for this file.
     * @param relativePath path to the file relative to rootDir
     * @returns
     */
    public getScopeFunctionsForFile(options: { relativePath: string }): MaybePromise<string[]> {
        //remove the leading `pkg:/` if it exists
        const file = this.programBuilder.program.getFile(options?.relativePath);
        const scopes = this.programBuilder.program.getScopesForFile(file);

        const result = new Set<string>();

        for (let scope of scopes) {
            scope.getAllCallables();
            for (let container of scope.getAllCallables()) {
                result.add(container.callable.name);
            }
        }
        return [...result];
    }

    public dispose() {
        return this.programBuilder.dispose();
    }
}
