import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES,  UPDATE_TYPES } from './Constants';

class DebuggerUpdateUndefined {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public updateType: string;
  public data = -1;

  constructor(buffer: Buffer) {
    // The minimum size of a undefined response
    if (buffer.byteLength >= 12) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Updates will always have an id of zero because we didn't ask for this information
        if (this.requestId === 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.updateType = UPDATE_TYPES[bufferReader.readUInt32LE()];

          // Only handle undefined events in this class
          if (this.updateType === 'UNDEF') {
            this.data = bufferReader.readUInt8();
            this.byteLength = bufferReader.readOffset;
            this.success = true;
          }
        }
      } catch (error) {
        // Could not process
      }
    }
  }
}

export { DebuggerUpdateUndefined };
