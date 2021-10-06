import { createSandbox } from 'sinon';
import { standardizePath as s } from './FileUtils';
import type { SourceBreakpoint } from './breakpoints/BreakpointQueue';

export let sinon = createSandbox();
export const tmpDir = s`${process.cwd()}/.tmp`;
export const outDir = s`${tmpDir}/outDir`;
export const stagingDir = s`${tmpDir}/stagingDir`;
export const rootDir = s`${tmpDir}/rootDir`;
export const sourceDirChild = s`${tmpDir}/sourceDirChild`;
export const sourceDirParent = s`${tmpDir}/sourceDirParent`;
export const sourceDirGrandparent = s`${tmpDir}/sourceDirGrandparent`;
export const sourceDirs = [
    sourceDirChild,
    sourceDirParent,
    sourceDirGrandparent
];
