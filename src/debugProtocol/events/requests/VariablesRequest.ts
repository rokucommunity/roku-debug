/* eslint-disable no-bitwise */
import { SmartBuffer } from 'smart-buffer';
import { Command } from '../../Constants';
import { protocolUtil } from '../../ProtocolUtil';
import type { ProtocolRequest } from '../ProtocolEvent';

export class VariablesRequest implements ProtocolRequest {

    public static fromJson(data: {
        requestId: number;
        getChildKeys: boolean;
        enableForceCaseInsensitivity: boolean;
        threadIndex: number;
        stackFrameIndex: number;
        variablePathEntries: Array<{
            name: string;
            forceCaseInsensitive: boolean;
        }>;
    }) {
        const request = new VariablesRequest();
        protocolUtil.loadJson(request, data);
        request.data.variablePathEntries ??= [];
        // all variables will be case sensitive if the flag is disabled
        for (const entry of request.data.variablePathEntries) {
            if (request.data.enableForceCaseInsensitivity !== true) {
                entry.forceCaseInsensitive = false;
            } else {
                //default any missing values to false
                entry.forceCaseInsensitive ??= false;
            }
        }
        return request;
    }

    public static fromBuffer(buffer: Buffer) {
        const request = new VariablesRequest();
        protocolUtil.bufferLoaderHelper(request, buffer, 12, (smartBuffer) => {
            protocolUtil.loadCommonRequestFields(request, smartBuffer);

            const variableRequestFlags = smartBuffer.readUInt8(); // variable_request_flags

            request.data.getChildKeys = !!(variableRequestFlags & VariableRequestFlag.GetChildKeys);
            request.data.enableForceCaseInsensitivity = !!(variableRequestFlags & VariableRequestFlag.CaseSensitivityOptions);
            request.data.threadIndex = smartBuffer.readUInt32LE(); // thread_index
            request.data.stackFrameIndex = smartBuffer.readUInt32LE(); // stack_frame_index
            const variablePathLength = smartBuffer.readUInt32LE(); // variable_path_len
            request.data.variablePathEntries = [];
            if (variablePathLength > 0) {
                for (let i = 0; i < variablePathLength; i++) {
                    request.data.variablePathEntries.push({
                        name: protocolUtil.readStringNT(smartBuffer), // variable_path_entries - optional
                        //by default, all variable lookups are case SENSITIVE
                        forceCaseInsensitive: false
                    });
                }

                //get the case sensitive settings for each part of the path
                if (request.data.enableForceCaseInsensitivity) {
                    for (let i = 0; i < variablePathLength; i++) {
                        //0 means case SENSITIVE lookup, 1 means forced case INsensitive lookup
                        request.data.variablePathEntries[i].forceCaseInsensitive = smartBuffer.readUInt8() === 0 ? false : true;
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
        variableRequestFlags |= this.data.getChildKeys ? VariableRequestFlag.GetChildKeys : 0;
        variableRequestFlags |= this.data.enableForceCaseInsensitivity ? VariableRequestFlag.CaseSensitivityOptions : 0;

        smartBuffer.writeUInt8(variableRequestFlags); // variable_request_flags
        smartBuffer.writeUInt32LE(this.data.threadIndex); // thread_index
        smartBuffer.writeUInt32LE(this.data.stackFrameIndex); // stack_frame_index
        smartBuffer.writeUInt32LE(this.data.variablePathEntries.length); // variable_path_len
        for (const entry of this.data.variablePathEntries) {
            smartBuffer.writeStringNT(entry.name); // variable_path_entries - optional
        }
        if (this.data.enableForceCaseInsensitivity) {
            for (const entry of this.data.variablePathEntries) {
                //0 means case SENSITIVE lookup, 1 means force case INsensitive lookup
                smartBuffer.writeUInt8(entry.forceCaseInsensitive !== true ? 0 : 1);
            }
        }

        protocolUtil.insertCommonRequestFields(this, smartBuffer);
        return smartBuffer.toBuffer();
    }

    public success = false;

    public readOffset: number = undefined;

    public data = {
        /**
         * Indicates whether the VARIABLES response includes the child keys for container types like lists and associative arrays. If this is set to true (0x01), the VARIABLES response include the child keys.
         */
        getChildKeys: undefined as boolean,

        /**
         * Enables the client application to send path_force_case_insensitive data for each variable
         */
        enableForceCaseInsensitivity: undefined as boolean,

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
            forceCaseInsensitive: boolean;
        }>,

        //common props
        packetLength: undefined as number,
        requestId: undefined as number,
        command: Command.Variables
    };
}

export enum VariableRequestFlag {
    GetChildKeys = 1,
    CaseSensitivityOptions = 2
}
