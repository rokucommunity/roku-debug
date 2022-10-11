import { SmartBuffer } from 'smart-buffer';
import type { StopReasonCode } from '../../Constants';
import { ErrorCode } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';

export class ExecuteV3Response {
    public static fromJson(data: {
        requestId: number;
        executeSuccess: boolean;
        runtimeStopCode: StopReasonCode;
        compileErrors: string[];
        runtimeErrors: string[];
        otherErrors: string[];
    }) {
        const response = new ExecuteV3Response();
        protocolUtils.loadJson(response, data);
        response.data.compileErrors ??= [];
        response.data.runtimeErrors ??= [];
        response.data.otherErrors ??= [];
        return response;
    }

    public static fromBuffer(buffer: Buffer) {
        const response = new ExecuteV3Response();
        protocolUtils.bufferLoaderHelper(response, buffer, 8, (smartBuffer: SmartBuffer) => {
            protocolUtils.loadCommonResponseFields(response, smartBuffer);

            response.data.executeSuccess = smartBuffer.readUInt8() !== 0; //execute_success
            response.data.runtimeStopCode = smartBuffer.readUInt8(); //runtime_stop_code

            const compileErrorCount = smartBuffer.readUInt32LE(); // num_compile_errors
            response.data.compileErrors = [];
            for (let i = 0; i < compileErrorCount; i++) {
                response.data.compileErrors.push(
                    protocolUtils.readStringNT(smartBuffer)
                );
            }

            const runtimeErrorCount = smartBuffer.readUInt32LE(); // num_runtime_errors
            response.data.runtimeErrors = [];
            for (let i = 0; i < runtimeErrorCount; i++) {
                response.data.runtimeErrors.push(
                    protocolUtils.readStringNT(smartBuffer)
                );
            }

            const otherErrorCount = smartBuffer.readUInt32LE(); // num_other_errors
            response.data.otherErrors = [];
            for (let i = 0; i < otherErrorCount; i++) {
                response.data.otherErrors.push(
                    protocolUtils.readStringNT(smartBuffer)
                );
            }
        });
        return response;
    }

    public toBuffer() {
        const smartBuffer = new SmartBuffer();

        smartBuffer.writeUInt8(this.data.executeSuccess ? 1 : 0); //execute_success
        smartBuffer.writeUInt8(this.data.runtimeStopCode); //runtime_stop_code

        smartBuffer.writeUInt32LE(this.data.compileErrors?.length ?? 0); // num_compile_errors
        for (let error of this.data.compileErrors ?? []) {
            smartBuffer.writeStringNT(error);
        }

        smartBuffer.writeUInt32LE(this.data.runtimeErrors?.length ?? 0); // num_runtime_errors
        for (let error of this.data.runtimeErrors ?? []) {
            smartBuffer.writeStringNT(error);
        }

        smartBuffer.writeUInt32LE(this.data.otherErrors?.length ?? 0); // num_other_errors
        for (let error of this.data.otherErrors ?? []) {
            smartBuffer.writeStringNT(error);
        }

        protocolUtils.insertCommonResponseFields(this, smartBuffer);

        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = 0;

    public data = {
        /**
         * Indicates whether the code ran and completed without errors (true)
         */
        executeSuccess: undefined as boolean,
        /**
         * A StopReason enum.
         */
        runtimeStopCode: undefined as StopReasonCode,
        /**
         * The list of compile-time errors.
         */
        compileErrors: undefined as string[],
        /**
         * The list of runtime errors.
         */
        runtimeErrors: undefined as string[],
        /**
         * The list of other errors.
         */
        otherErrors: undefined as string[],

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        errorCode: ErrorCode.OK
    };
}
