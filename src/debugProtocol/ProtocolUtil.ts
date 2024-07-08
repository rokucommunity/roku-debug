import { SmartBuffer } from 'smart-buffer';
import { util } from '../util';
import type { Command, UpdateType } from './Constants';
import { CommandCode, UpdateTypeCode, ErrorCode, ErrorFlags } from './Constants';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from './events/ProtocolEvent';

export class ProtocolUtil {

    /**
     * Load json data onto an event, and mark it as successful
     */
    public loadJson(event: { data: any; success: boolean }, data: any) {
        event.data = {
            ...event.data,
            ...(data ?? {})
        };
        event.success = true;
    }

    /**
     * Helper function for buffer loading.
     * Handles things like try/catch, setting buffer read offset, etc
     */
    public bufferLoaderHelper(event: { success: boolean; readOffset: number; data?: { packetLength?: number } }, buffer: Buffer, minByteLength: number, processor: (buffer: SmartBuffer) => boolean | void) {
        // Required size of this processor
        try {
            if (buffer.byteLength >= minByteLength) {
                let smartBuffer = SmartBuffer.fromBuffer(buffer);

                //have the processor consume the requred bytes.
                event.success = (processor(smartBuffer) ?? true) as boolean;

                //if the event has a packet length, use THAT as the read offset. Otherwise, set the offset to the end of the read position of the buffer
                if (event.success) {
                    if (!event.readOffset) {
                        event.readOffset = event.data.packetLength ?? smartBuffer.readOffset;
                    }
                }
            }
        } catch (error) {
            // Could not parse
            event.readOffset = 0;
            event.success = false;
        }
        return event;
    }

    /**
     * Load the common DebuggerRequest fields
     */
    public loadCommonRequestFields(request: ProtocolRequest, smartBuffer: SmartBuffer) {
        request.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
        request.data.requestId = smartBuffer.readUInt32LE(); // request_id
        request.data.command = CommandCode[smartBuffer.readUInt32LE()] as Command; // command_code
    }

    /**
     * Load the common DebuggerResponse
     */
    public loadCommonResponseFields(response: ProtocolResponse, smartBuffer: SmartBuffer) {
        response.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
        response.data.requestId = smartBuffer.readUInt32LE(); // request_id
        response.data.errorCode = smartBuffer.readUInt32LE(); // error_code

        //if the error code is non-zero, and we have more bytes, then there will be additional data about the error
        if (response.data.errorCode !== ErrorCode.OK && response.data.packetLength > smartBuffer.readOffset) {
            response.data.errorData = {};
            const errorFlags = smartBuffer.readUInt32LE(); // error_flags
            // eslint-disable-next-line no-bitwise
            if (errorFlags & ErrorFlags.INVALID_VALUE_IN_PATH) {
                response.data.errorData.invalidPathIndex = smartBuffer.readUInt32LE(); // invalid_path_index
            }
            // eslint-disable-next-line no-bitwise
            if (errorFlags & ErrorFlags.MISSING_KEY_IN_PATH) {
                response.data.errorData.missingKeyIndex = smartBuffer.readUInt32LE(); // missing_key_index
            }
        }
    }

    public loadCommonUpdateFields(update: ProtocolUpdate, smartBuffer: SmartBuffer, updateType: UpdateType) {
        update.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
        update.data.requestId = smartBuffer.readUInt32LE(); // request_id
        update.data.errorCode = smartBuffer.readUInt32LE(); // error_code
        // requestId 0 means this is an update.
        if (update.data.requestId === 0) {
            update.data.updateType = UpdateTypeCode[smartBuffer.readUInt32LE()] as UpdateType;

            //if this is not the update type we want, return false
            if (update.data.updateType !== updateType) {
                return false;
            }

        } else {
            //not an update. We should not proceed any further.
            throw new Error('This is not an update');
        }
    }

    /**
     * Inserts the common command fields to the beginning of the buffer, and computes
     * the correct `packet_length` value.
     */
    public insertCommonRequestFields(request: ProtocolRequest, smartBuffer: SmartBuffer) {
        smartBuffer.insertUInt32LE(CommandCode[request.data.command], 0); // command_code - An enum representing the debugging command being sent. See the COMMANDS enum
        smartBuffer.insertUInt32LE(request.data.requestId, 0); // request_id - The ID of the debugger request (must be >=1). This ID is included in the debugger response.
        smartBuffer.insertUInt32LE(smartBuffer.writeOffset + 4, 0); // packet_length - The size of the packet to be sent.
        request.data.packetLength = smartBuffer.writeOffset;
        return smartBuffer;
    }

    public insertCommonResponseFields(response: ProtocolResponse, smartBuffer: SmartBuffer) {
        //insert error data
        const flags = (
            // eslint-disable-next-line no-bitwise
            0 |
            (util.isNullish(response?.data?.errorData?.invalidPathIndex) ? 0 : ErrorFlags.INVALID_VALUE_IN_PATH) |
            (util.isNullish(response?.data?.errorData?.missingKeyIndex) ? 0 : ErrorFlags.MISSING_KEY_IN_PATH)
        );
        if (
            response.data.errorCode !== ErrorCode.OK &&
            //there's some error data
            Object.values(response.data.errorData ?? {}).some(x => !util.isNullish(x))
        ) {
            //do these in reverse order since we're writing to the start of the buffer

            if (!util.isNullish(response.data.errorData.missingKeyIndex)) {
                smartBuffer.insertUInt32LE(response.data.errorData.missingKeyIndex, 0);
            }
            //write error data
            if (!util.isNullish(response.data.errorData.invalidPathIndex)) {
                smartBuffer.insertUInt32LE(response.data.errorData.invalidPathIndex, 0);
            }

            //write flags
            smartBuffer.insertUInt32LE(flags, 0);
        }
        smartBuffer.insertUInt32LE(response.data.errorCode, 0); // error_code
        smartBuffer.insertUInt32LE(response.data.requestId, 0); // request_id
        smartBuffer.insertUInt32LE(smartBuffer.writeOffset + 4, 0); // packet_length
        response.data.packetLength = smartBuffer.writeOffset;
        return smartBuffer;
    }


    /**
     * Inserts the common response fields to the beginning of the buffer, and computes
     * the correct `packet_length` value.
     */
    public insertCommonUpdateFields(update: ProtocolUpdate, smartBuffer: SmartBuffer) {
        smartBuffer.insertUInt32LE(UpdateTypeCode[update.data.updateType], 0); // update_type
        smartBuffer.insertUInt32LE(update.data.errorCode, 0); // error_code
        smartBuffer.insertUInt32LE(update.data.requestId, 0); // request_id
        smartBuffer.insertUInt32LE(smartBuffer.writeOffset + 4, 0); // packet_length
        update.data.packetLength = smartBuffer.writeOffset;
        return smartBuffer;
    }

    /**
     * Tries to read a string from the buffer and will throw an error if there is no null terminator.
     * @param {SmartBuffer} bufferReader
     */
    public readStringNT(bufferReader: SmartBuffer): string {
        // Find next null character (if one is not found, throw)
        let buffer = bufferReader.toBuffer();
        let foundNullTerminator = false;
        for (let i = bufferReader.readOffset; i < buffer.length; i++) {
            if (buffer[i] === 0x00) {
                foundNullTerminator = true;
                break;
            }
        }

        if (!foundNullTerminator) {
            throw new Error('Could not read buffer string as there is no null terminator.');
        }
        return bufferReader.readStringNT();
    }
}

export const protocolUtil = new ProtocolUtil();

