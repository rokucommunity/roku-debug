import * as fsExtra from 'fs-extra';
import * as fastGlob from 'fast-glob';
import * as cloneRegexp from 'clone-regexp';
import * as path from 'path';
import * as rokuDeploy from 'roku-deploy';
import type { Position, Range } from 'brighterscript';
import { standardizePath as s, util } from 'brighterscript';
import { Cache } from 'brighterscript/dist/Cache';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import lineColumn = require('line-column');

export class FileUtils {

    /**
     * Determine if the `subjectPath` contains and also ends with the test path
     * @param subjectPath the path that `testPath` should be found within
     * @param testPath the path that the `subjectPath` should end with
     */
    public pathEndsWith(subjectPath: string, testPath: string) {
        subjectPath = this.standardizePath(subjectPath);
        testPath = this.standardizePath(testPath);
        let idx = subjectPath.indexOf(testPath);
        return (idx > -1 && subjectPath.endsWith(testPath));
    }

    /**
     * Determines if the `subject` path includes `search` path, with case sensitive comparison
     * @param subject
     * @param search
     */
    public pathIncludesCaseInsensitive(subject: string, search: string) {
        if (!subject || !search) {
            return false;
        }
        return path.normalize(subject.toLowerCase()).includes(path.normalize(search.toLowerCase()));
    }

    /**
     * Replace the first instance of `search` in `subject` with `replacement`
     */
    public replaceCaseInsensitive(subject: string, search: string, replacement: string) {
        let idx = subject.toLowerCase().indexOf(search.toLowerCase());
        if (idx > -1) {
            let result = subject.substring(0, idx) + replacement + subject.substring(idx + search.length);
            return result;
        } else {
            return subject;
        }
    }

    /**
     * Given a `directoryPath`, find and return all file paths relative to the `directoryPath`
     * @param directoryPath
     */
    public async getAllRelativePaths(directoryPath: string) {
        let paths = await fastGlob('**/*', {
            cwd: s`${directoryPath}`
        });
        return paths
            //os-normalize each path separator
            .map(x => s`${x}`);
    }

    /**
     * Given a partial file path (truncated path from Roku telnet console),
     * search through the staging directory and find any paths that appear to
     * match the partial file path
     * @param partialFilePath the partial file path to search for
     * @param directoryPath the path to the directory to search through
     * @returns a relative path to the first match found in the directory
     */
    public async findPartialFileInDirectory(partialFilePath: string, directoryPath: string) {
        //the debugger path was truncated, so try and map it to a file in the outdir
        partialFilePath = this.standardizePath(
            this.removeFileTruncation(partialFilePath)
        );

        //find any files from the outDir that end the same as this file
        let results: string[] = [];
        let relativePaths = await this.getAllRelativePaths(directoryPath);
        for (let relativePath of relativePaths) {
            //if the staging path looks like the debugger path, keep it for now
            if (this.pathEndsWith(relativePath, partialFilePath)) {
                results.push(relativePath);
            }
        }

        //TODO is there something more we should do about finding multiple matches?
        if (results.length > 1) {
            console.warn(
                `Found multiple paths in '${directoryPath}' that match '${partialFilePath}'. Returning the first result, but you should consider renaming files in longer file paths to something unique`
            );
        }

        //return the first path found (or undefined if no results found);
        return results[0];
    }

    /**
     * The Roku telnet debugger truncates file paths, so this removes that truncation piece.
     * @param filePath
     */
    public removeFileTruncation(filePath: string) {
        return filePath.startsWith('...') ? filePath.substring(3) : filePath;
    }

    /**
     * Given a relative file path, and a list of directories, find the first directory that contains the relative file.
     * This is basically a utility function for the sourceDirs concept
     * @param relativeFilePath - the path to the item relative to each `directoryPath`
     * @param directoryPaths - an array of directory paths
     * @returns the first path that was found to exist, or undefined if the file was not found in any of the `directoryPaths`
     */
    public async findFirstRelativeFile(relativeFilePath: string, directoryPaths: string[]) {
        for (let directoryPath of directoryPaths) {
            let fullPath = path.normalize(path.join(directoryPath, relativeFilePath));
            if (await fsExtra.pathExists(fullPath)) {
                return fullPath;
            }
        }
    }

    /**
     * Determine if the filename ends with one of the specified extensions
     */
    public hasAnyExtension(fileName: string, extensions: string[]) {
        let ext = path.extname(fileName);
        return extensions.includes(ext);
    }

    /**
     * Given a path to a directory, and an absolute path to a file,
     * get the relative file path (relative to the containingFolderPath)
     */
    public getRelativePath(containingFolderPath: string, filePathAbsolute: string) {
        return fileUtils.replaceCaseInsensitive(filePathAbsolute, containingFolderPath, '');
    }

    /**
     * Find the first `directoryPath` that is a parent to `filePathAbsolute`
     * @param filePathAbsolute - the absolute path to the file
     * @param directoryPaths - a list of directories where this file might reside
     */
    public findFirstParent(filePathAbsolute: string, directoryPaths: string[]) {
        filePathAbsolute = this.standardizePath(filePathAbsolute);
        for (let directoryPath of directoryPaths) {
            directoryPath = this.standardizePath(directoryPath);
            if (filePathAbsolute.startsWith(directoryPath)) {
                return directoryPath;
            }
        }
    }

    /**
     * Find the number at the end of component library prefix at the end of the file.
     * (i.e. "pkg:/source/main_lib1.brs" returns 1)
     * All files in component libraries are renamed to include the component library index as the ending portion of the filename,
     * which is necessary because the Roku debugger doesn't tell you which component library a file came from.
     */
    public getComponentLibraryIndexFromFileName(filePath: string, postfix: string) {
        let regex = new RegExp(postfix + '(\\d+)');
        let match = regex.exec(filePath);
        let result: number | undefined;
        if (match) {
            result = parseInt(match[1]);
            if (isNaN(result)) {
                result = undefined;
            }
        }
        return result;
    }

    /**
     * Replace all directory separators with current OS separators,
     * force all drive letters to lower case (because that's what VSCode does sometimes so this makes it consistent)
     * @param thePath
     */
    public standardizePath(thePath: string) {
        if (!thePath) {
            return thePath;
        }
        let normalizedPath = path.normalize(
            thePath.replace(/[\/\\]+/g, path.sep)
        );
        //force the drive letter to lower case
        normalizedPath = this.driveLetterToLower(normalizedPath);
        return normalizedPath;
    }

    /**
     * Force the drive letter to lower case
     * @param fullPath
     */
    public driveLetterToLower(fullPath: string) {
        if (fullPath) {
            let firstCharCode = fullPath.charCodeAt(0);
            if (
                //is upper case A-Z
                firstCharCode >= 65 && firstCharCode <= 90 &&
                //next char is colon
                fullPath[1] === ':'
            ) {
                fullPath = fullPath[0].toLowerCase() + fullPath.substring(1);
            }
        }
        return fullPath;
    }

    /**
     * Get a file url for a file path (i.e. file:///C:/projects/Something or file:///projects/something
     * @param fullPath
     */
    public getFileProtocolPath(fullPath: string) {
        if (fullPath.startsWith('file://')) {
            return fullPath;
        }
        let result: string;
        if (fullPath.startsWith('/') || fullPath.startsWith('\\')) {
            result = `file://${fullPath}`;
        } else {
            result = `file:///${fullPath}`;
        }
        return result;
    }

    /**
     * Find all locations of the regex pattern in the specified files.
     * @param pattern a regular expression pattern to find in all files. The global flag will be force-enabled before it's used.
     */
    private async findInFiles(pattern: RegExp, cwd: string, fileGlobs: string[]) {
        const filePaths = await fastGlob(fileGlobs, {
            cwd: cwd,
            absolute: true
        });
        const results: Array<{
            srcPath: string;
            range: Range;
            fileContents: string;
            match: RegExpExecArray;
        }> = [];
        await Promise.all(filePaths.map(async (filePath) => {
            const fileContents = (await fsExtra.readFile(filePath)).toString();
            const finder = lineColumn(fileContents);
            let match: RegExpExecArray;
            const regexp = cloneRegexp(pattern, { global: true });
            while ((match = regexp.exec(fileContents))) {
                const beginPosition = finder.fromIndex(match.index);
                const endPosition = finder.fromIndex(match.index + match[0].length);
                results.push({
                    srcPath: s`${filePath}`,
                    //finder returns 1-based line and col values, so offset that in the Range
                    range: util.createRange(
                        beginPosition.line - 1,
                        beginPosition.col - 1,
                        endPosition.line - 1,
                        endPosition.col - 1
                    ),
                    fileContents: fileContents,
                    match: match
                });
            }
        }));
        results.sort((a, b) => a.srcPath.toLowerCase().localeCompare(b.srcPath.toLowerCase()));
        return results;
    }

    /**
     * Given a path to a folder, search all files until an entry point is found.
     * (An entry point is a function that roku uses as the Main function to start the program).
     * @param rootDir - a path to the root of a Roku project.
     */
    public findEntryPoint(rootDir: string) {
        return this.entryPointCache.getOrAdd(this.standardizePath(rootDir), async (projectPath: string) => {
            projectPath = s`${projectPath}`;
            let searchResults = await this.findInFiles(
                /(?:sub|function)\s+(RunUserInterface|main|RunScreenSaver)\s*\(/ig,
                projectPath,
                ['source/**/*.brs']
            );

            if (searchResults.length === 0) {
                throw new Error('Unable to find an entry point. Please make sure that you have a RunUserInterface, RunScreenSaver, or Main sub/function declared in your BrightScript project');
            }

            const [firstResult] = searchResults;

            let destPath = fileUtils.removeLeadingSlash(
                rokuDeploy.util.stringReplaceInsensitive(firstResult.srcPath, projectPath, '')
            );
            return {
                functionName: firstResult.match[1],
                srcPath: firstResult.srcPath,
                destPath: destPath,
                fileContents: firstResult.fileContents,
                position: firstResult.range.start
            };
        });
    }

    private entryPointCache = new Cache<string, Promise<{
        functionName: string;
        srcPath: string;
        destPath: string;
        fileContents: string;
        /**
         * The position (zero-based) of the start of the `sub`|`function` keyword for the entry point
         */
        position: Position;
    }>>();

    /**
     * If a string has a leading slash, remove it
     */
    public removeLeadingSlash(thePath: string) {
        if (typeof thePath === 'string') {
            while (thePath.startsWith('/') || thePath.startsWith('\\')) {
                thePath = thePath.substring(1);
            }
        }
        return thePath;
    }

    /**
     * If a string has a trailing slash, remove it
     */
    public removeTrailingSlash(thePath: string) {
        if (typeof thePath === 'string') {
            while (thePath.endsWith('/') || thePath.endsWith('\\')) {
                thePath = thePath.slice(0, -1);
            }
        }
        return thePath;
    }
}

export let fileUtils = new FileUtils();

/**
 * A tagged template literal function for standardizing the path.
 */
export function standardizePath(stringParts, ...expressions: any[]) {
    let result = [];
    for (let i = 0; i < stringParts.length; i++) {
        result.push(stringParts[i], expressions[i]);
    }
    return fileUtils.standardizePath(
        result.join('')
    );
}
