import { createSandbox } from 'sinon';
import { fileUtils, standardizePath as s } from './FileUtils';

export let sinon = createSandbox();
export const tmpDir = s`${process.cwd()}/.tmp`;
export const outDir = s`${tmpDir}/outDir`;
export const stagingDir = s`${tmpDir}/stagingDir`;
export const rootDir = s`${tmpDir}/rootDir`;
