import { ProgramBuilder } from 'brighterscript';
import type { MaybePromise } from '../interfaces';
import type { DebugProtocol } from '@vscode/debugprotocol';

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
    public getScopeFunctionsForFile(options: { relativePath: string }): MaybePromise<Array<ScopeFunction>> {
        //remove the leading `pkg:/` if it exists
        const file = this.programBuilder.program.getFile(options?.relativePath);
        const scopes = this.programBuilder.program.getScopesForFile(file);

        const result = new Map<string, number>();

        for (let scope of scopes) {
            scope.getAllCallables();
            for (let container of scope.getAllCallables()) {
                if (result.has(container.callable.name)) {
                    result.set(container.callable.name, result.get(container.callable.name) + 1);
                } else {
                    result.set(container.callable.name, 1);
                }
            }
        }

        return [...result].map(([name, count]) => {
            return {
                name: name,
                completionItemKind: count === scopes.length ? 'function' : 'text'
            };
        });
    }

    public dispose() {
        return this.programBuilder.dispose();
    }
}

export interface ScopeFunction {
    name: string;
    completionItemKind: DebugProtocol.CompletionItemType;
}
