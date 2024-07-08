import { DebugProtocolServer } from './DebugProtocolServer';
import * as Net from 'net';
import { createSandbox } from 'sinon';
import { expect } from 'chai';
const sinon = createSandbox();

describe('DebugProtocolServer', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('start', () => {
        it('uses default port and host when not specified', async () => {
            const tcpServer = {
                on: () => { },
                listen: (options, callback) => {
                    callback();
                }
            };
            sinon.stub(Net, 'Server').returns(tcpServer);
            const stub = sinon.stub(tcpServer, 'listen').callThrough();

            const protocolServer = new DebugProtocolServer({});
            await protocolServer.start();
            expect(stub.getCall(0).args[0]).to.eql({
                port: 8081,
                hostName: '0.0.0.0'
            });
        });
    });
});
