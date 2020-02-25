const NUM_8_BYTES = 1;
const NUM_32_BYTES = 4;
const NUM_64_BYTES = 8;

class BufferReader {
  public offset = 0;
  public byteLength = -1;

  private buffer: Buffer;

  constructor(buffer: Buffer, offset = 0) {
    this.buffer = buffer;

    if (this.buffer.length >= offset) {
      this.offset = offset;
      this.byteLength = this.buffer.byteLength;
    } else  {
      throw new Error('Bad offset');
    }
  }

  public readUInt8(offset = this.offset): number {
    this.checkOffset(offset);
    let value = this.buffer.readUInt8(offset);
    this.offset = offset + NUM_8_BYTES;
    return value;
  }

  public readUInt32LE(offset = this.offset): number {
    this.checkOffset(offset);
    let value = this.buffer.readUInt32LE(offset);
    this.offset = offset + NUM_32_BYTES;
    return value;
  }

  public readInt32LE(offset = this.offset): number {
    this.checkOffset(offset);
    let value = this.buffer.readInt32LE(offset);
    this.offset = offset + NUM_32_BYTES;
    return value;
  }

  public readUInt64LE(offset = this.offset): bigint {
    this.checkOffset(offset);
    let value = this.buffer.readBigUInt64LE(offset);
    this.offset = offset + NUM_64_BYTES;
    return value;
  }

  public readInt64LE(offset = this.offset): bigint {
    this.checkOffset(offset);
    let value = this.buffer.readBigInt64LE(offset);
    this.offset = offset + NUM_64_BYTES;
    return value;
  }

  public readDouble(offset = this.offset): number {
    this.checkOffset(offset);
    let value = new DataView(this.buffer).getFloat64(offset, true);
    this.offset = offset + NUM_64_BYTES;
    return value;
  }

  public readFloat(offset = this.offset): number {
    this.checkOffset(offset);
    let value = new DataView(this.buffer).getFloat32(offset, true);
    this.offset = offset + NUM_32_BYTES;
    return value;
  }

  public readNTString(offset = this.offset): string {
    this.checkOffset(offset);
    let value = '';
    let byteLength = offset;
    for (byteLength; byteLength <= this.buffer.length; byteLength ++) {
      this.checkOffset(byteLength);
      value = this.buffer.toString('utf8', offset, byteLength);

      if (value.endsWith('\0')) {
        break;
      }
    }

    this.offset = byteLength;
    return value;
  }

  private checkOffset(offset) {
    if (this.buffer.length < offset) {
      throw new Error('Bad offset');
    }
  }
}

export { BufferReader };
