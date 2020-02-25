import { util } from './util';

const ERROR_CODES = {
  0: 'OK',
  1: 'OTHER_ERR',
  2: 'UNDEFINED_COMMAND',
  3: 'CANT_CONTINUE',
  4: 'NOT_STOPPED',
  5: 'INVALID_ARGS'
};

class DebuggerVariableRequestResponse {
  public success = false;
  public byteLength = 0;

  // response fields
  public requestId = -1;
  public errorCode: string;
  public numVariables = -1;
  public variables = [];

  constructor(buffer: Buffer) {
    if (buffer.byteLength >= 13) {
      this.requestId = buffer.readUInt32LE(0);
      this.errorCode = ERROR_CODES[buffer.readUInt32LE(4)];
      this.numVariables = buffer.readUInt32LE(8);

      let offSet = 12;
      for (let i = 0; i < this.numVariables; i++) {
        let variableInfo = new VariableInfo(buffer, offSet);
        if (variableInfo.success) {
          offSet = variableInfo.byteLength;
          this.variables.push(variableInfo);
        }
      }

      this.success = (this.variables.length === this.numVariables);
    }
  }
}

const FLAGS = {
  isChildKey: 0x01,
  isConst: 0x02,
  isContainer: 0x04,
  isNameHere: 0x08,
  isRefCounted: 0x10,
  isValueHere: 0x20
};

const VARIABLE_TYPES = {
  1: 'AA',
  2: 'Array',
  3: 'Boolean',
  4: 'Double',
  5: 'Float',
  6: 'Function',
  7: 'Integer',
  8: 'Interface',
  9: 'Invalid',
  10: 'List',
  11: 'Long_Integer',
  12: 'Object',
  13: 'String',
  14: 'Subroutine',
  15: 'Subtyped_Object',
  16: 'Uninitialized',
  17: 'Unknown'
};

class VariableInfo {
  public success = false;
  public byteLength = 0;

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

  constructor(buffer: Buffer, offset: number) {
    if (buffer.byteLength >= 13) {
      let bitwiseMask = buffer.readUInt8(0 + offset);
      for (const property in FLAGS) {
        // tslint:disable-next-line:no-bitwise
        this[property] = (bitwiseMask & FLAGS[property]) > 0;
      }

      this.variableType = VARIABLE_TYPES[buffer.readUInt8(1 + offset)];

      let byteLength = offset + 2;

      if (this.isNameHere) {
        let nameResults = getString(buffer, byteLength);
        if (nameResults.success) {
          this.name = nameResults.value;
          byteLength = nameResults.byteLength;
        }
      }

      if (this.isRefCounted) {
        this.refCount = buffer.readUInt32LE(byteLength);
        byteLength += 4;
      }

      if (this.isContainer) {
        this.keyType = VARIABLE_TYPES[buffer.readUInt8(byteLength)];
        byteLength += 1;
        this.elementCount = buffer.readUInt32LE(byteLength);
        byteLength += 4;
      }

      let value: any;
      switch (this.variableType) {
        case 'Interface':
        case 'Object':
        case 'String':
        case 'Subroutine':
        case 'Function':
          let valueResults = getString(buffer, byteLength);
          if (valueResults.success) {
            this.value = valueResults.value;
            this.byteLength = valueResults.byteLength;
            this.success = true;
          }
          break;
        case 'Subtyped_Object':
          let names = [];
          for (let i = 0; i < 2; i++) {
              // tslint:disable-next-line:no-shadowed-variable
              let valueResults = getString(buffer, byteLength);
              if (valueResults.success) {
                names.push(valueResults.value);
                byteLength = valueResults.byteLength;
              }
          }

          if (names.length === 2) {
            this.value = names.join('; ');
            this.byteLength = byteLength;
            this.success = true;
          }
          break;
        case 'Boolean':
          value = buffer.readUInt8(byteLength);
          this.value = (value > 0);
          this.byteLength = byteLength + 1;
          this.success = true;
          break;
        case 'Double':
          // tslint:disable-next-line:no-var-keyword
          var view = new DataView(buffer);
          value = view.getFloat64(byteLength, true);
          this.byteLength = byteLength + 8;
          this.success = true;
          break;
        case 'Float':
          var view = new DataView(buffer);
          value = view.getFloat32(byteLength, true);
          this.byteLength = byteLength + 4;
          this.success = true;
          break;
        case 'Integer':
          this.value = buffer.readUInt32LE(byteLength);
          this.byteLength = byteLength + 4;
          this.success = true;
          break;
        case 'LongInteger':
          this.value = buffer.readBigUInt64LE(byteLength);
          this.byteLength = byteLength + 8;
          this.success = true;
          break;
        default:
          this.value = null;
          this.byteLength = byteLength;
          this.success = true;
      }
    }
  }
}

function getString(buffer, offset) {
  let completeValue = false;
  let value = '';
  let byteLength = offset;
  for (byteLength; byteLength <= buffer.length; byteLength ++) {
    value = buffer.toString('utf8', offset, byteLength);

    if (value.endsWith('\0')) {
      completeValue = true;
      break;
    }
  }

  return {
    byteLength: byteLength,
    value: value,
    success: completeValue
  };
}

export { DebuggerVariableRequestResponse };
