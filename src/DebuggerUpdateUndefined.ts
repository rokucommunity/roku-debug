import { SmartBuffer } from 'smart-buffer';

const UPDATE_TYPES = {
  0: 'UNDEF',
  1: 'IO_PORT_OPENED',
  2: 'ALL_THREADS_STOPPED',
  3: 'THREAD_ATTACHED'
};

const ERROR_CODES = {
  0: 'OK',
  1: 'OTHER_ERR',
  2: 'UNDEFINED_COMMAND',
  3: 'CANT_CONTINUE',
  4: 'NOT_STOPPED',
  5: 'INVALID_ARGS'
};

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
