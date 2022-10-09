/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import { COMMANDS, VARIABLE_REQUEST_FLAGS } from '../../Constants';
import { protocolUtils } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';
import { util } from '../../../util';

export class VariablesRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        getChildKeys: boolean;
        enableCaseInsensitivityFlag: boolean;
        threadIndex: number;
        stackFrameIndex: number;
        variablePathEntries: Array<{
            name: string;
            isCaseSensitive: boolean;
        }>;
    }) {
        const request = new VariablesRequest();
        protocolUtils.loadJson(request, data);
        request.data.variablePathEntries ??= [];
        // force all variables to case SENSITIVE if using the flag is disabled (just for consistency purposes),
        // as it won't actually be sent
        if (!request.data.enableCaseInsensitivityFlag) {
            for (const entry of request.data.variablePathEntries) {
                entry.isCaseSensitive = true;
            }
        }
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new VariablesRequest();
        protocolUtils.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtils.loadCommonRequestFields(request, smartBuffer);

            const variableRequestFlags = smartBuffer.readUInt8(); // variable_request_flags

            request.data.getChildKeys = !!(variableRequestFlags & VARIABLE_REQUEST_FLAGS.GET_CHILD_KEYS);
            request.data.enableCaseInsensitivityFlag = !!(variableRequestFlags & VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS);
            request.data.threadIndex = smartBuffer.readUInt32LE(); // thread_index
            request.data.stackFrameIndex = smartBuffer.readUInt32LE(); // stack_frame_index
            const variablePathLength = smartBuffer.readUInt32LE(); // variable_path_len
            request.data.variablePathEntries = [];
            if (variablePathLength > 0) {
                for (let i = 0; i < variablePathLength; i++) {
                    request.data.variablePathEntries.push({
                        name: util.readStringNT(smartBuffer), // variable_path_entries - optional
                        isCaseSensitive: true
                    });
                }

                //get the case sensitive settings for each part of the path
                if (request.data.enableCaseInsensitivityFlag) {
                    for (let i = 0; i < variablePathLength; i++) {
                        //0 means case SENSITIVE lookup, 1 means case INsensitive lookup
                        request.data.variablePathEntries[i].isCaseSensitive = smartBuffer.readUInt8() === 0 ? true : false;
                    }
                }
            }
        });
        return request;
    }

    public toBuffer(): Buffer {
        const smartBuffer = new SmartBuffer();

        //build the flags var
        let variableRequestFlags = 0;
        variableRequestFlags |= this.data.getChildKeys ? VARIABLE_REQUEST_FLAGS.GET_CHILD_KEYS : 0;
        variableRequestFlags |= this.data.enableCaseInsensitivityFlag ? VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS : 0;

        smartBuffer.writeUInt8(variableRequestFlags); // variable_request_flags
        smartBuffer.writeUInt32LE(this.data.threadIndex); // thread_index
        smartBuffer.writeUInt32LE(this.data.stackFrameIndex); // stack_frame_index
        smartBuffer.writeUInt32LE(this.data.variablePathEntries.length); // variable_path_len
        for (const entry of this.data.variablePathEntries) {
            smartBuffer.writeStringNT(entry.name); // variable_path_entries - optional
        }
        if (this.data.enableCaseInsensitivityFlag) {
            for (const entry of this.data.variablePathEntries) {
                //0 means case SENSITIVE lookup, 1 means case INsensitive lookup
                smartBuffer.writeUInt8(entry.isCaseSensitive ? 0 : 1);
            }
        }

        protocolUtils.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset = -1;

    public data = {
        /**
         * Indicates whether the VARIABLES response includes the child keys for container types like lists and associative arrays. If this is set to true (0x01), the VARIABLES response include the child keys.
         */
        getChildKeys: undefined as boolean,

        /**
         * Enables the client application to send path_force_case_insensitive data for each variable
         */
        enableCaseInsensitivityFlag: undefined as boolean,

        /**
         * The index of the thread containing the variable.
         */
        threadIndex: undefined as number,
        /**
         * The index of the frame returned from the STACKTRACE command.
         * The 0 index contains the first function called; nframes-1 contains the last.
         * This indexing does not match the order of the frames returned from the STACKTRACE command
         */
        stackFrameIndex: undefined as number,

        /**
         * A set of one or more path entries to the variable to be inspected. For example, `m.top.myarray[6]` can be accessed with `["m","top","myarray","6"]`.
         *
         * If no path is specified, the variables accessible from the specified stack frame are returned.
         */
        variablePathEntries: undefined as Array<{
            name: string;
            isCaseSensitive: boolean;
        }>,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        commandCode: COMMANDS.VARIABLES
    };
}
