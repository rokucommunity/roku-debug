import { SmartBuffer } from 'smart-buffer';
import { util } from '../../../util';

export class ExecuteResponseV3 {
    constructor(buffer: Buffer) {
        // The smallest a request response can be
        if (buffer.byteLength >= 12) {
            try {
                let bufferReader = SmartBuffer.fromBuffer(buffer);
                this.requestId = bufferReader.readUInt32LE(); // request_id
                this.errorCode = bufferReader.readUInt32LE(); // error_code
                this.executeSuccess = bufferReader.readUInt8() !== 0; //execute_success
                this.runtimeStopCode = bufferReader.readUInt8(); //runtime_stop_code

                this.compileErrors = new ExecuteErrors(bufferReader);
                this.runtimeErrors = new ExecuteErrors(bufferReader);
                this.otherErrors = new ExecuteErrors(bufferReader);

                this.success = this.compileErrors.success && this.runtimeErrors.success && this.otherErrors.success;
                this.readOffset = bufferReader.readOffset;
            } catch (error) {
                // Could not parse
            }
        }
    }
    public success = false;
    public readOffset = 0;
    /**
     * true if code ran and completed without    errors, false otherwise
     */
    public executeSuccess = false;
    public runtimeStopCode: number;

    public compileErrors: ExecuteErrors;
    public runtimeErrors: ExecuteErrors;
    public otherErrors: ExecuteErrors;

    // response fields
    public requestId = -1;
    public errorCode = -1;
}

class ExecuteErrors {
    public constructor(bufferReader: SmartBuffer) {
        if (bufferReader.length >= 4) {
            const errorCount = bufferReader.readUInt32LE();
            for (let i = 0; i < errorCount; i++) {
                const message = util.readStringNT(bufferReader);
                if (message) {
                    this.messages.push(message);
                }
            }
            this.success = this.messages.length === errorCount;
        }
    }

    public success = false;

    public messages: string[] = [];
}
