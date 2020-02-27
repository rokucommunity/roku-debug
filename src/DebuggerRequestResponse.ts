import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES } from './Constants';

class DebuggerRequestResponse {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public data = -1;

  constructor(buffer: Buffer) {
    // The smallest a request response can be
    if (buffer.byteLength >= 8) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Any request id less then one is an update and we should not process it here
        if (this.requestId > 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.byteLength = bufferReader.readOffset;
          this.success = true;
        }
      } catch (error) {
        // Could not parse
      }
    }
  }
}

export { DebuggerRequestResponse };
