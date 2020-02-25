import { BufferReader } from './BufferReader';

export const UPDATE_TYPES = {
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

class DebuggerUpdateConnectIoPort {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public updateType: string;
  public data = -1;

  constructor(buffer: Buffer) {
    // The minimum size of a connect to IO port request
    if (buffer.byteLength >= 16) {
      try {
        let bufferReader = new BufferReader(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Updates will always have an id of zero because we didn't ask for this information
        if (this.requestId === 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.updateType = UPDATE_TYPES[bufferReader.readUInt32LE()];

          // Only handle IO port events in this class
          if (this.updateType === 'IO_PORT_OPENED') {
            this.data = bufferReader.readUInt32LE();
            this.byteLength = bufferReader.offset;
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
