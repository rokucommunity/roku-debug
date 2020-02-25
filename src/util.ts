import * as fsExtra from 'fs-extra';
import * as path from 'path';

export class Util {
  /**
   * Reads and converts a json file to an object from the project
   * @param {String} relativePath
   * @returns {Object} object version of the file
   */
  public async readJsonFile(relativePath: string): Promise < any > {
    const contents = (await fsExtra.readFile(this.convertToAbsolutePath(relativePath))).toString('utf8');
    return JSON.parse(contents);
  }

  /**
   * Helper to convert relative project paths to absolute paths
   * @param {String} relativePath
   * @returns {String} absolute path
   */
  public convertToAbsolutePath(relativePath: string, basePath?: string): string {
    if (!basePath) {
      basePath = process.cwd();
    }
    console.log(path.resolve(`${basePath}/${relativePath}`));
    return path.resolve(`${basePath}/${relativePath}`);
  }
}

export let util = new Util();
