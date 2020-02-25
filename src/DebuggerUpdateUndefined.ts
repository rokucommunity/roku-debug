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
    if (buffer.byteLength >= 12) {
      this.requestId = buffer.readUInt32LE(0);
      if (this.requestId === 0) {
        this.errorCode = ERROR_CODES[buffer.readUInt32LE(4)];
        this.updateType = UPDATE_TYPES[buffer.readUInt32LE(8)];

        if (this.updateType === 'UNDEF') {
          this.data = buffer.readUInt8(12);
          this.success = true;
          this.byteLength = 13;
        }
      }
    }
  }
}

export { DebuggerUpdateUndefined };
