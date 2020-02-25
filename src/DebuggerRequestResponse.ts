const ERROR_CODES = {
  0: 'OK',
  1: 'OTHER_ERR',
  2: 'UNDEFINED_COMMAND',
  3: 'CANT_CONTINUE',
  4: 'NOT_STOPPED',
  5: 'INVALID_ARGS'
};

class DebuggerRequestResponse {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public data = -1;

  constructor(buffer: Buffer) {
    if (buffer.byteLength >= 8) {
      this.requestId = buffer.readUInt32LE(0);
      if (this.requestId > 0) {
        this.errorCode = ERROR_CODES[buffer.readUInt32LE(4)];
        this.byteLength = 8;
        this.success = true;
      }
    }
  }
}

export { DebuggerRequestResponse };
