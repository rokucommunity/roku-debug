import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { SmartBuffer } from 'smart-buffer';

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
   * Tries to read a string from the buffer and will throw an error if there is no null terminator.
   * @param {SmartBuffer} bufferReader
   */
  public readStringNT(bufferReader: SmartBuffer): string {
    // Find next null character (if one is not found, throw)
    let buffer = bufferReader.toBuffer();
    let foundNullTerminator = false;
    for (let i = bufferReader.readOffset; i < buffer.length; i++) {
      if (buffer[i] === 0x00) {
        foundNullTerminator = true;
        break;
      }
    }

    if (!foundNullTerminator) {
      throw new Error('Could not read buffer string as there is no null terminator.');
    }
    return bufferReader.readStringNT();
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
