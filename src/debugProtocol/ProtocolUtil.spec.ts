import { expect } from 'chai';
import { protocolUtil } from './ProtocolUtil';
import type { ProtocolUpdate } from './events/ProtocolEvent';
import { SmartBuffer } from 'smart-buffer';
import { ErrorCode, UpdateType, UpdateTypeCode } from './Constants';
import { expectThrows } from '../testHelpers.spec';

describe('ProtocolUtil', () => {
    describe('loadJson', () => {
        it('defaults to an empty object', () => {
            protocolUtil.loadJson({} as any, undefined);
            //test passes if there was no exception
        });
    });

    describe('bufferLoaderHelper', () => {
        it('handles when no event success', () => {
            expect(
                protocolUtil.bufferLoaderHelper({
                    readOffset: -1
                } as any, Buffer.alloc(1), 0, () => false).readOffset
            ).to.eql(-1);
        });
    });

    describe('loadCommonUpdateFields', () => {
        it('handles when the requestId is greater than 0', () => {
            const update = {
                data: {}
            } as ProtocolUpdate;
            const buffer = new SmartBuffer();
            buffer.writeUInt32LE(12); //packet_length
            buffer.writeUInt32LE(999); //request_id
            buffer.writeUInt32LE(ErrorCode.OK); //error_code
            expectThrows(
                () => protocolUtil.loadCommonUpdateFields(update, buffer, UpdateType.CompileError),
                'This is not an update'
            );
        });

        it('returns false if this is the wrong update type', () => {
            const update = {
                data: {}
            } as ProtocolUpdate;
            const buffer = new SmartBuffer();
            buffer.writeUInt32LE(12); //packet_length
            buffer.writeUInt32LE(0); //request_id
            buffer.writeUInt32LE(ErrorCode.OK); //error_code
            buffer.writeUInt32LE(UpdateTypeCode.AllThreadsStopped); //update_type
            expect(
                protocolUtil.loadCommonUpdateFields(update, buffer, UpdateType.CompileError)
            ).to.be.false;
        });
    });
});
