import { expect } from 'chai';
import { HandshakeRequest } from './HandshakeRequest';

describe('HandshakeRequest', () => {
    it('serializes and deserializes properly', () => {
        let request = HandshakeRequest.fromJson({
            magic: 'theMagic!'
        });

        expect(request.data).to.eql({
            packetLength: undefined,
            requestId: HandshakeRequest.REQUEST_ID,
            command: undefined,

            magic: 'theMagic!'
        });

        request = HandshakeRequest.fromBuffer(request.toBuffer());
        expect(request.readOffset).to.eql(10);

        expect(
            request.data
        ).to.eql({
            packetLength: undefined,
            requestId: HandshakeRequest.REQUEST_ID,
            command: undefined,

            magic: 'theMagic!'
        });
    });
});
