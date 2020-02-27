import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, UPDATE_TYPES } from './Constants';

class DebuggerUpdateConnectIoPort {
  public success = false;
  public readOffset = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public updateType: string;
  public data = -1;

  constructor(buffer: Buffer) {
    // The minimum size of a connect to IO port request
    if (buffer.byteLength >= 16) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Updates will always have an id of zero because we didn't ask for this information
        if (this.requestId === 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.updateType = UPDATE_TYPES[bufferReader.readUInt32LE()];

          // Only handle IO port events in this class
          if (this.updateType === 'IO_PORT_OPENED') {
            this.data = bufferReader.readUInt32LE();
            this.readOffset = bufferReader.readOffset;
            this.success = true;
          }
        }
      } catch (error) {
        // Could not parse
      }
    }
  }
}

export { DebuggerUpdateConnectIoPort };
