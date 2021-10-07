import * as fsExtra from 'fs-extra';
import type { CodeWithSourceMap } from 'source-map';
import { SourceNode } from 'source-map';
import type { Project } from '../managers/ProjectManager';
import type { SourceMapManager } from '../managers/SourceMapManager';
import { util } from '../util';


/**
 * Writes breakpoints to files in the staging dir
 */
export class BreakpointWriter {

    public constructor(
        public sourceMapManager: SourceMapManager
    ) {

    }

    public launchConfiguration: {
        enableSourceMaps?: boolean;
    };

    /**
     * Write "stop" lines into source code for each breakpoint of each file in the given project
     */
    public async writeBreakpointsForProject(project: Project, breakpoints: Breakpoint) {
        let breakpointsByStagingFilePath = await this.getBreakpointWork(project);

        let promises = [] as Promise<any>[];
        for (let stagingFilePath in breakpointsByStagingFilePath) {
            promises.push(this.writeBreakpointsToFile(stagingFilePath, breakpointsByStagingFilePath[stagingFilePath]));
        }

        await Promise.all(promises);
    }

    /**
     * Write breakpoints to the specified file, and update the sourcemaps to match
     */
    private async writeBreakpointsToFile(stagingFilePath: string, breakpoints: BreakpointWorkItem[]) {

        //do not crash if the file doesn't exist
        if (!await fsExtra.pathExists(stagingFilePath)) {
            util.log(`Path not found ${stagingFilePath}`);
            return;
        }

        //load the file as a string
        let fileContents = (await fsExtra.readFile(stagingFilePath)).toString();

        let originalFilePath = breakpoints[0].type === 'sourceMap'
            //the calling function will merge this sourcemap into the other existing sourcemap, so just use the same name because it doesn't matter
            ? breakpoints[0].rootDirFilePath
            //the calling function doesn't have a sourcemap for this file, so we need to point it to the sourceDirs found location (probably rootDir...)
            : breakpoints[0].sourceFilePath;

        let sourceAndMap = this.getSourceAndMapWithBreakpoints(fileContents, originalFilePath, breakpoints);

        //if we got a map file back, write it to the filesystem
        if (sourceAndMap.map) {
            let sourceMap = JSON.stringify(sourceAndMap.map);
            //It's ok to overwrite the file in staging because if the original code provided a source map,
            //then our LocationManager class will walk the sourcemap chain from staging, to rootDir, and then
            //on to the original location
            await fsExtra.writeFile(`${stagingFilePath}.map`, sourceMap);
            //update the in-memory version of this source map
            this.sourceMapManager.set(`${stagingFilePath}.map`, sourceMap);
        }

        //overwrite the file that now has breakpoints injected
        await fsExtra.writeFile(stagingFilePath, sourceAndMap.code);
    }

    private bpIndex = 1;
    public getSourceAndMapWithBreakpoints(fileContents: string, originalFilePath: string, breakpoints: BreakpointWorkItem[]) {
        let chunks = [] as Array<SourceNode | string>;

        //split the file by newline
        let lines = eol.split(fileContents);
        let newline = '\n';
        for (let originalLineIndex = 0; originalLineIndex < lines.length; originalLineIndex++) {
            let line = lines[originalLineIndex];
            //if is final line
            if (originalLineIndex === lines.length - 1) {
                newline = '';
            }
            //find breakpoints for this line (breakpoint lines are 1-indexed, but our lineIndex is 0-based)
            let lineBreakpoints = breakpoints.filter(bp => bp.line - 1 === originalLineIndex);
            //if we have a breakpoint, insert that before the line
            for (let bp of lineBreakpoints) {
                let linesForBreakpoint = this.getBreakpointLines(bp, originalFilePath);

                //separate each line for this breakpoint with a newline
                for (let bpLine of linesForBreakpoint) {
                    chunks.push(bpLine);
                    chunks.push('\n');
                }
            }

            //add the original code now
            chunks.push(
                //sourceNode expects 1-based row indexes
                new SourceNode(originalLineIndex + 1, 0, originalFilePath, `${line}${newline}`)
            );
        }

        let node = new SourceNode(null, null, originalFilePath, chunks);

        //if sourcemaps are disabled, skip sourcemap generation and only generate the code
        if (this.launchConfiguration?.enableSourceMaps === false) {
            return {
                code: node.toString(),
                map: undefined
            } as CodeWithSourceMap;
        } else {
            return node.toStringWithSourceMap();
        }
    }

    private getBreakpointLines(breakpoint: BreakpointWorkItem, originalFilePath: string) {
        let lines = [];
        if (breakpoint.logMessage) {
            let logMessage = breakpoint.logMessage;
            //wrap the log message in quotes
            logMessage = `"${logMessage}"`;
            let expressionsCheck = /\{(.*?)\}/g;
            let match;

            // Get all the value to evaluate as expressions
            // eslint-disable-next-line no-cond-assign
            while (match = expressionsCheck.exec(logMessage)) {
                logMessage = logMessage.replace(match[0], `"; ${match[1]};"`);
            }

            // add a PRINT statement right before this line with the formated log message
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, `PRINT ${logMessage}`));
        } else if (breakpoint.condition) {
            // add a conditional STOP statement
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, `if ${breakpoint.condition} then : STOP : end if`));
        } else if (breakpoint.hitCondition) {
            let hitCondition = parseInt(breakpoint.hitCondition);

            if (isNaN(hitCondition) || hitCondition === 0) {
                // add a STOP statement right before this line
                lines.push(`STOP`);
            } else {
                let prefix = `m.vscode_bp`;
                let bpName = `bp${this.bpIndex++}`;
                let checkHits = `if ${prefix}.${bpName} >= ${hitCondition} then STOP`;
                let increment = `${prefix}.${bpName} ++`;

                // Create the BrightScript code required to track the number of executions
                let trackingExpression = `
                    if Invalid = ${prefix} OR Invalid = ${prefix}.${bpName} then
                        if Invalid = ${prefix} then
                            ${prefix} = {${bpName}: 0}
                        else
                            ${prefix}.${bpName} = 0
                    else
                        ${increment} : ${checkHits}
                `;
                //coerce the expression into single-line
                trackingExpression = trackingExpression.replace(/\n/gi, '').replace(/\s+/g, ' ').trim();
                // Add the tracking expression right before this line
                lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, trackingExpression));
            }
        } else {
            // add a STOP statement right before this line. Map the stop code to the line the breakpoint represents
            //because otherwise source-map will return null for this location
            lines.push(new SourceNode(breakpoint.line, 0, originalFilePath, 'STOP'));
        }
        return lines;
    }
}
