import { SmartBuffer } from 'smart-buffer';
import type { CommandData as RequestData } from './Constants';
import type { ProtocolRequest } from './requests/ProtocolRequest';
import type { ProtocolResponse } from './responses/ProtocolResponse';

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
    public bufferLoaderHelper(event: { success: boolean; readOffset: number }, buffer: Buffer, minByteLength: number, processor: (buffer: SmartBuffer) => boolean | void) {
        // Required size of this processor
        if (buffer.byteLength >= minByteLength) {
            try {
                let smartBuffer = SmartBuffer.fromBuffer(buffer);

                //have the processor consume the requred bytes.
                event.success = (processor(smartBuffer) ?? true) as boolean;

                event.readOffset = smartBuffer.readOffset;
            } catch (error) {
                // Could not parse
                event.readOffset = 0;
                event.success = false;
            }
        }
        return event;
    }

    /**
     * Load the common `Command` (i.e. `DebuggerRequest`) fields
     */
    public loadCommonRequestFields(command: ProtocolRequest<RequestData> | ProtocolResponse<RequestData>, smartBuffer: SmartBuffer) {
        command.data.packetLength = smartBuffer.readUInt32LE(); // packet_length
        command.data.requestId = smartBuffer.readUInt32LE(); // request_id
        command.data.commandCode = smartBuffer.readUInt32LE(); // command_code
    }

    /**
     * Inserts the common command fields to the beginning of the buffer, and computes
     * the correct `packet_length` value.
     */
    public insertCommonRequestFields(command: ProtocolRequest<RequestData> | ProtocolResponse<RequestData>, smartBuffer: SmartBuffer) {
        smartBuffer.insertUInt32LE(command.data.commandCode, 0); // command_code - An enum representing the debugging command being sent. See the COMMANDS enum
        smartBuffer.insertUInt32LE(command.data.requestId, 0); // request_id - The ID of the debugger request (must be >=1). This ID is included in the debugger response.
        smartBuffer.insertUInt32LE(smartBuffer.writeOffset + 4, 0); // packet_length - The size of the packet to be sent.
        command.data.packetLength = smartBuffer.writeOffset;
        return smartBuffer;
    }
}

export const protocolUtils = new ProtocolUtils();

