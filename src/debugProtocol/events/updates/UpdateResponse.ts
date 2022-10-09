import type { SmartBuffer } from 'smart-buffer';
import type { UPDATE_TYPES } from '../../Constants';
import { ProtocolResponse } from '../zzresponsesOld/ProtocolResponse';

export abstract class UpdateResponse extends ProtocolResponse {
    public abstract data: {
        packetLength: number;
        requestId: number;
        errorCode: number;
        updateType: number;
    };
}

