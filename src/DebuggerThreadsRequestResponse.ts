import { SmartBuffer } from 'smart-buffer';

const ERROR_CODES = {
  0: 'OK',
  1: 'OTHER_ERR',
  2: 'UNDEFINED_COMMAND',
  3: 'CANT_CONTINUE',
  4: 'NOT_STOPPED',
  5: 'INVALID_ARGS'
};

class DebuggerThreadsRequestResponse {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public threadsCount = -1;
  public threads = [];

  constructor(buffer: Buffer) {
    // The smallest a threads request response can be
    if (buffer.byteLength >= 21) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Any request id less then one is an update and we should not process it here
        if (this.requestId > 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.threadsCount = bufferReader.readUInt32LE();

          for (let i = 0; i < this.threadsCount; i ++) {
            let stackEntry = new ThreadInfo(bufferReader);
            if (stackEntry.success) {
              // All the necessary stack entry data was present. Push to the entries array.
              this.threads.push(stackEntry);
            }
          }

          this.byteLength = bufferReader.readOffset;
          this.success = (this.threads.length === this.threadsCount);
        }
      } catch (error) {
        // Could not parse
      }
    }
  }
}

const STOP_REASONS = {
  0: 'UNDEFINED',
  1: 'NOT_STOPPED',
  2: 'NORMAL_EXIT',
  3: 'STOP_STATEMENT',
  4: 'BREAK',
  5: 'RUNTIME_ERROR'
};

class ThreadInfo {
  public success = false;

  // response fields
  public isPrimary: boolean;
  public stopReason: string;
  public stopReasonDetail: string;
  public lineNumber = -1;
  public functionName: string;
  public fileName: string;
  public codeSnippet: string;

  constructor(bufferReader: SmartBuffer) {
    // NOTE: The docs say the flags should be unit8 and uint32. In testing it seems like they are sending uint32 but meant to send unit8.
    this.isPrimary = (bufferReader.readUInt32LE() & 0x01) > 0;
    this.stopReason = STOP_REASONS[bufferReader.readUInt8()];
    this.stopReasonDetail = bufferReader.readStringNT();
    this.lineNumber = bufferReader.readUInt32LE();
    this.functionName = bufferReader.readStringNT();
    this.fileName = bufferReader.readStringNT();
    this.codeSnippet = bufferReader.readStringNT();
    this.success = true;
  }
}

export { DebuggerThreadsRequestResponse };
