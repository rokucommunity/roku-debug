import { SmartBuffer } from 'smart-buffer';
import { ERROR_CODES, VARIABLE_FLAGS, VARIABLE_TYPES } from './Constants';

class DebuggerVariableRequestResponse {
  public success = false;
  public readOffset = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public numVariables = -1;
  public variables = [];

  constructor(buffer: Buffer) {
    // Minimum variable request response size
    if (buffer.byteLength >= 13) {
      try {
        let bufferReader = SmartBuffer.fromBuffer(buffer);
        this.requestId = bufferReader.readUInt32LE();

        // Any request id less then one is an update and we should not process it here
        if (this.requestId > 0) {
          this.errorCode = ERROR_CODES[bufferReader.readUInt32LE()];
          this.numVariables = bufferReader.readUInt32LE();

          // iterate over each variable in the buffer data and create a Variable Info object
          for (let i = 0; i < this.numVariables; i++) {
            let variableInfo = new VariableInfo(bufferReader);
            if (variableInfo.success) {
              // All the necessary variable data was present. Push to the variables array.
              this.variables.push(variableInfo);
            }
          }

          this.readOffset = bufferReader.readOffset;
          this.success = (this.variables.length === this.numVariables);
        }
      } catch (error) {
        // Could not process
      }
    }
  }
}

class VariableInfo {
  public success = false;

  // response flags
  public isChildKey: boolean;
  public isConst: boolean;
  public isContainer: boolean;
  public isNameHere: boolean;
  public isRefCounted: boolean;
  public isValueHere: boolean;

  // response fields
  public variableType: string;
  public name: string;
  public refCount = -1;
  public keyType: string;
  public elementCount = -1;
  public value: any;

  constructor(bufferReader: SmartBuffer) {
    if (bufferReader.length >= 13) {
      // Determine the different variable properties
      let bitwiseMask = bufferReader.readUInt8();
      for (const property in VARIABLE_FLAGS) {
        this[property] = (bitwiseMask & VARIABLE_FLAGS[property]) > 0;
      }

      this.variableType = VARIABLE_TYPES[bufferReader.readUInt8()];

      if (this.isNameHere) {
        // YAY we have a name. Pull it out of the buffer.
        this.name = bufferReader.readStringNT();
      }

      if (this.isRefCounted) {
        // This variables reference counts are tracked and we can pull it from the buffer.
        this.refCount = bufferReader.readUInt32LE();
      }

      if (this.isContainer) {
        // It is a form of container object.
        // Are the key strings or integers for example
        this.keyType = VARIABLE_TYPES[bufferReader.readUInt8()];
        // Equivalent to length on arrays
        this.elementCount = bufferReader.readUInt32LE();
      }

      // Pull out the variable data based on the type if that type returns a value
      let value: any;
      switch (this.variableType) {
        case 'Interface':
        case 'Object':
        case 'String':
        case 'Subroutine':
        case 'Function':
          this.value = bufferReader.readStringNT();
          this.success = true;
          break;
        case 'Subtyped_Object':
          let names = [];
          for (let i = 0; i < 2; i++) {
              names.push(bufferReader.readStringNT());
          }

          if (names.length === 2) {
            this.value = names.join('; ');
            this.success = true;
          }
          break;
        case 'Boolean':
          this.value = (bufferReader.readUInt8() > 0);
          this.success = true;
          break;
        case 'Double':
          this.value = bufferReader.readDoubleLE();
          this.success = true;
          break;
        case 'Float':
          this.value = bufferReader.readFloatLE();
          this.success = true;
          break;
        case 'Integer':
          this.value = bufferReader.readInt32LE();
          this.success = true;
          break;
        case 'LongInteger':
          this.value = bufferReader.readBigInt64LE();
          this.success = true;
          break;
        default:
          this.value = null;
          this.success = true;
      }
    }
  }
}

export { DebuggerVariableRequestResponse };
