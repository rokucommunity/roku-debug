import { expect } from 'chai';
import { ErrorCode, StopReasonCode, UpdateType } from '../../Constants';
import { ExecuteV3Response } from './ExecuteV3Response';

describe('ExecuteV3Response', () => {
    it('defaults empty arrays for missing error arrays', () => {
        const response = ExecuteV3Response.fromJson({} as any);
        expect(response.data.compileErrors).to.eql([]);
        expect(response.data.runtimeErrors).to.eql([]);
        expect(response.data.otherErrors).to.eql([]);
    });

    it('uses default values when data is missing', () => {
        let response = ExecuteV3Response.fromJson({} as any);
        response.data = {} as any;
        response = ExecuteV3Response.fromBuffer(
            response.toBuffer()
        );
        expect(response.data.executeSuccess).to.eql(false);
        expect(response.data.compileErrors).to.eql([]);
        expect(response.data.runtimeErrors).to.eql([]);
        expect(response.data.otherErrors).to.eql([]);
    });

    it('serializes and deserializes properly', () => {
        const command = ExecuteV3Response.fromJson({
            requestId: 3,
            executeSuccess: true,
            runtimeStopCode: StopReasonCode.Break,
            compileErrors: [
                'compile 1'
            ],
            runtimeErrors: [
                'runtime 1'
            ],
            otherErrors: [
                'other 1'
            ]
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,

            executeSuccess: true,
            runtimeStopCode: StopReasonCode.Break,
            compileErrors: [
                'compile 1'
            ],
            runtimeErrors: [
                'runtime 1'
            ],
            otherErrors: [
                'other 1'
            ]
        });

        expect(
            ExecuteV3Response.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 54, // 4 bytes
            requestId: 3, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes

            executeSuccess: true, // 1 byte
            runtimeStopCode: StopReasonCode.Break, // 1 byte

            // num_compile_errors // 4 bytes
            compileErrors: [
                'compile 1' // 10 bytes
            ],
            // num_runtime_errors // 4 bytes
            runtimeErrors: [
                'runtime 1' // 10 bytes
            ],
            // num_other_errors // 4 bytes
            otherErrors: [
                'other 1' // 8 bytes
            ]
        });
    });

    it('Handles zero errors', () => {
        const command = ExecuteV3Response.fromJson({
            requestId: 3,
            executeSuccess: true,
            runtimeStopCode: StopReasonCode.Break,

            compileErrors: [],
            runtimeErrors: [],
            otherErrors: []
        });

        expect(command.data).to.eql({
            packetLength: undefined,
            requestId: 3,
            errorCode: ErrorCode.OK,

            executeSuccess: true,
            runtimeStopCode: StopReasonCode.Break,
            compileErrors: [],
            runtimeErrors: [],
            otherErrors: []
        });

        expect(
            ExecuteV3Response.fromBuffer(command.toBuffer()).data
        ).to.eql({
            packetLength: 26, // 4 bytes
            requestId: 3, // 4 bytes
            errorCode: ErrorCode.OK, // 4 bytes

            executeSuccess: true, // 1 byte
            runtimeStopCode: StopReasonCode.Break, // 1 byte
            // num_compile_errors // 4 bytes
            compileErrors: [],
            // num_runtime_errors // 4 bytes
            runtimeErrors: [],
            // num_other_errors // 4 bytes
            otherErrors: []
        });
    });
});
