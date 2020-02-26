import { BufferReader } from './BufferReader';

const ERROR_CODES = {
  0: 'OK',
  1: 'OTHER_ERR',
  2: 'UNDEFINED_COMMAND',
  3: 'CANT_CONTINUE',
  4: 'NOT_STOPPED',
  5: 'INVALID_ARGS'
};

class DebuggerStacktraceRequestResponse {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public stackSize = -1;
  public entries = [];

  constructor(buffer: Buffer) {
    // The smallest a stacktrace request response can be
    if (buffer.byteLength >= 8) {
      try {
        let bufferReader = new BufferReader(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Any request id less then one is an update and we should not process it here
        if (this.requestId > 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.stackSize = bufferReader.readUInt32LE();

          for (let i = 0; i < this.stackSize; i ++) {
            let stackEntry = new StackEntry(bufferReader);
            if (stackEntry.success) {
              // All the necessary stack entry data was present. Push to the entries array.
              this.entries.push(stackEntry);
            }
          }

          this.byteLength = bufferReader.offset;
          this.success = (this.entries.length === this.stackSize);
        }
      } catch (error) {
        // Could not parse
      }
    }
  }
}

class StackEntry {
  public success = false;

  // response fields
  public lineNumber = -1;
  public functionName: string;
  public fileName: string;

  constructor(bufferReader: BufferReader) {
    this.lineNumber = bufferReader.readUInt32LE();
    this.functionName = bufferReader.readNTString();
    this.fileName = bufferReader.readNTString();
    this.success = true;
  }
}

export { DebuggerStacktraceRequestResponse };
