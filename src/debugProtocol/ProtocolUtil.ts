import { SmartBuffer } from 'smart-buffer';
import type { UPDATE_TYPES } from './Constants';
import type { ProtocolRequest, ProtocolResponse, ProtocolUpdate } from './events/ProtocolEvent';

export class ProtocolUtils {

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
        request.data.commandCode = smartBuffer.readUInt32LE(); // command_code
    }

    /**
     * Load the common DebuggerResponse
     */
    public loadCommonResponseFields(request: ProtocolResponse, smartBuffer: SmartBuffer) {
        request.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
        request.data.requestId = smartBuffer.readUInt32LE(); // request_id
        request.data.errorCode = smartBuffer.readUInt32LE(); // error_code
    }

    public loadCommonUpdateFields(update: ProtocolUpdate, smartBuffer: SmartBuffer, updateType: UPDATE_TYPES) {
        update.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
        update.data.requestId = smartBuffer.readUInt32LE(); // request_id
        update.data.errorCode = smartBuffer.readUInt32LE(); // error_code
        // requestId 0 means this is an update.
        if (update.data.requestId === 0) {
            update.data.updateType = smartBuffer.readUInt32LE();

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
        smartBuffer.insertUInt32LE(request.data.commandCode, 0); // command_code - An enum representing the debugging command being sent. See the COMMANDS enum
        smartBuffer.insertUInt32LE(request.data.requestId, 0); // request_id - The ID of the debugger request (must be >=1). This ID is included in the debugger response.
        smartBuffer.insertUInt32LE(smartBuffer.writeOffset + 4, 0); // packet_length - The size of the packet to be sent.
        request.data.packetLength = smartBuffer.writeOffset;
        return smartBuffer;
    }

    public insertCommonResponseFields(response: ProtocolResponse, smartBuffer: SmartBuffer) {
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
        smartBuffer.insertUInt32LE(update.data.updateType, 0); // update_type
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

export const protocolUtils = new ProtocolUtils();

