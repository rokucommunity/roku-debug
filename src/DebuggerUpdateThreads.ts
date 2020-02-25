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
      this.requestId = buffer.readUInt32LE(0);
      if (this.requestId === 0) {
        this.errorCode = ERROR_CODES[buffer.readUInt32LE(4)];
        this.updateType = UPDATE_TYPES[buffer.readUInt32LE(8)];

        let threadsUpdate: ThreadsStopped | ThreadAttached;
        if (this.updateType === 'ALL_THREADS_STOPPED') {
          threadsUpdate = new ThreadsStopped(buffer, 12);
          if (threadsUpdate.success) {
            this.data = threadsUpdate;
            this.byteLength = threadsUpdate.byteLength;
            this.success = true;
          }
        } else if (this.updateType === 'THREAD_ATTACHED') {
          threadsUpdate = new ThreadAttached(buffer, 12);
          if (threadsUpdate.success) {
            this.data = threadsUpdate;
            this.byteLength = threadsUpdate.byteLength;
            this.success = true;
          }
        }
      }
    }
  }
}

class ThreadsStopped {
  public success = false;
  public byteLength = 0;

  // response fields
  public primaryThreadIndex = -1;
  public stopReason = -1;
  public stopReasonDetail: string;

  constructor(buffer: Buffer, offset: number) {
    if (buffer.byteLength >= offset + 6) {
      this.primaryThreadIndex = buffer.readInt32LE(0 + offset);
      this.stopReason = STOP_REASONS[buffer.readUInt8(4 + offset)];

      let completeStopReason = false;
      let stopReasonDetail: string;
      let byteLength = offset + 5;
      for (byteLength; byteLength <= buffer.length; byteLength ++) {
        stopReasonDetail = buffer.toString('utf8', offset + 5, byteLength);

        if (stopReasonDetail.endsWith('\0')) {
          completeStopReason = true;
          break;
        }
      }

      if (completeStopReason) {
        this.stopReasonDetail = stopReasonDetail;
        this.byteLength = byteLength;
        this.success = true;
      }
    }
  }
}

class ThreadAttached {
  public success = false;
  public byteLength = 0;

  // response fields
  public threadIndex = -1;
  public stopReason = -1;
  public stopReasonDetail: string;

  constructor(buffer: Buffer, offset: number) {
    if (buffer.byteLength >= offset + 6) {
      this.threadIndex = buffer.readInt32LE(0 + offset);
      this.stopReason = STOP_REASONS[buffer.readUInt8(4 + offset)];

      let completeStopReason = false;
      let stopReasonDetail: string;
      let byteLength = offset + 5;
      for (byteLength; byteLength <= buffer.length; byteLength ++) {
        stopReasonDetail = buffer.toString('utf8', offset + 5, byteLength);

        if (stopReasonDetail.endsWith('\0')) {
          completeStopReason = true;
          break;
        }
      }

      if (completeStopReason) {
        this.stopReasonDetail = stopReasonDetail;
        this.byteLength = byteLength;
        this.success = true;
      }
    }
  }
}

export { DebuggerUpdateThreads };
