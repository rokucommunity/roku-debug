import { BufferReader } from './BufferReader';

class DebuggerHandshake {
  public success = false;
  public byteLength = 0;

  // response fields
  public magic: string;
  public majorVersion = -1;
  public minorVersion = -1;
  public patchVersion = -1;

  constructor(buffer: Buffer) {
    // Required size of the handshake
    if (buffer.byteLength >= 20) {
      try {
        let bufferReader = new BufferReader(buffer);
        this.magic = bufferReader.readNTString();
        this.majorVersion = bufferReader.readInt32LE();
        this.minorVersion = bufferReader.readInt32LE();
        this.patchVersion = bufferReader.readInt32LE();
        this.byteLength = bufferReader.offset;
        this.success = true;
      } catch (error) {
        // Could not parse
      }
    }
  }
}

export { DebuggerHandshake };
