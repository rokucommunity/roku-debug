import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, STOP_REASONS } from './Constants';

class DebuggerThreadsRequestResponse {
  public success = false;
  public readOffset = 0;

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

          this.readOffset = bufferReader.readOffset;
          this.success = (this.threads.length === this.threadsCount);
        }
      } catch (error) {
        // Could not parse
      }
    }
  }
}

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
