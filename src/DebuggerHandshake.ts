import { SmartBuffer } from 'smart-buffer';

class DebuggerHandshake {
  public success = false;
  public readOffset = 0;

  // response fields
  public magic: string;
  public majorVersion = -1;
  public minorVersion = -1;
  public patchVersion = -1;

  constructor(buffer: Buffer) {
    // Required size of the handshake
    if (buffer.byteLength >= 20) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.magic = bufferReader.readStringNT();
        this.majorVersion = bufferReader.readInt32LE();
        this.minorVersion = bufferReader.readInt32LE();
        this.patchVersion = bufferReader.readInt32LE();
        this.readOffset = bufferReader.readOffset;
        this.success = true;
      } catch (error) {
        // Could not parse
      }
    }
  }
}

export { DebuggerHandshake };
