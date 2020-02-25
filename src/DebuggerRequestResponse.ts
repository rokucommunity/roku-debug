import { BufferReader } from './BufferReader';

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
    // The smallest a request response can be
    if (buffer.byteLength >= 8) {
      try {
        let bufferReader = new BufferReader(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Any request id less then one is an update and we should not process it here
        if (this.requestId > 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.byteLength = bufferReader.offset;
          this.success = true;
        }
      } catch (error) {
        // Could not parse
      }
    }
  }
}

export { DebuggerRequestResponse };
