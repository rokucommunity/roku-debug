import { SmartBuffer } from 'smart-buffer';

const STOP_REASONS = {
  0: 'UNDEFINED',
  1: 'NOT_STOPPED',
  2: 'NORMAL_EXIT',
  3: 'STOP_STATEMENT',
  4: 'BREAK',
  5: 'RUNTIME_ERROR'
};

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

class DebuggerUpdateThreads {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public updateType: string;
  public data: ThreadsStopped | ThreadAttached;

  constructor(buffer: Buffer) {
    if (buffer.byteLength >= 12) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.requestId = bufferReader.readUInt32LE();
        if (this.requestId === 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.updateType = UPDATE_TYPES[bufferReader.readUInt32LE()];

          let threadsUpdate: ThreadsStopped | ThreadAttached;
          if (this.updateType === 'ALL_THREADS_STOPPED') {
            threadsUpdate = new ThreadsStopped(bufferReader);
          } else if (this.updateType === 'THREAD_ATTACHED') {
            threadsUpdate = new ThreadAttached(bufferReader);
          }

          if (threadsUpdate && threadsUpdate.success) {
            this.data = threadsUpdate;
            this.byteLength = bufferReader.readOffset;
            this.success = true;
          }
        }
      } catch (error) {
        // Can't be parsed
      }
    }
  }
}

class ThreadsStopped {
  public success = false;

  // response fields
  public primaryThreadIndex = -1;
  public stopReason = -1;
  public stopReasonDetail: string;

  constructor(bufferReader: SmartBuffer) {
    if (bufferReader.length >= bufferReader.readOffset + 6) {
      this.primaryThreadIndex = bufferReader.readInt32LE();
      this.stopReason = STOP_REASONS[bufferReader.readUInt8()];
      this.stopReasonDetail = bufferReader.readStringNT();
      this.success = true;
    }
  }
}

class ThreadAttached {
  public success = false;

  // response fields
  public threadIndex = -1;
  public stopReason = -1;
  public stopReasonDetail: string;

  constructor(bufferReader: SmartBuffer) {
    if (bufferReader.length >= bufferReader.readOffset + 6) {
      this.threadIndex = bufferReader.readInt32LE();
      this.stopReason = STOP_REASONS[bufferReader.readUInt8()];
      this.stopReasonDetail = bufferReader.readStringNT();
      this.success = true;
    }
  }
}

export { DebuggerUpdateThreads };
