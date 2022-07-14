import { Debugger } from './Debugger';
import { expect } from 'chai';
import { SmartBuffer } from 'smart-buffer';
import { MockDebugProtocolServer } from './MockDebugProtocolServer.spec';
import { createSandbox } from 'sinon';
import { createHandShakeResponse, createHandShakeResponseV3, createProtocolEventV3 } from './responses/responseCreationHelpers.spec';
import { HandshakeResponseV3, ProtocolEventV3 } from './responses';
import { ERROR_CODES, UPDATE_TYPES, VARIABLE_REQUEST_FLAGS } from './Constants';
const sinon = createSandbox();

describe('debugProtocol Debugger', () => {
    let bsDebugger: Debugger;
    let roku: MockDebugProtocolServer;

    beforeEach(async () => {
        sinon.stub(console, 'log').callsFake((...args) => { });
        roku = new MockDebugProtocolServer();
        await roku.initialize();

        bsDebugger = new Debugger({
            host: 'localhost',
            controllerPort: roku.controllerPort
        });
    });

    afterEach(() => {
        bsDebugger?.destroy();
        bsDebugger = undefined;
        sinon.restore();
        roku.destroy();
    });

    describe('connect', () => {
        it('sends magic to server on connect', async () => {
            let action = roku.waitForMagic();
            void bsDebugger.connect();
            void roku.processActions();
            let magic = await action.promise;
            expect(magic).to.equal(Debugger.DEBUGGER_MAGIC);
        });

        it('validates magic from server on connect', async () => {
            const magicAction = roku.waitForMagic();
            roku.sendHandshakeResponse(magicAction.promise);

            void bsDebugger.connect();

            void roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.true;
        });

        it('throws on magic mismatch', async () => {
            roku.waitForMagic();
            roku.sendHandshakeResponse('not correct magic');

            void bsDebugger.connect();

            void roku.processActions();

            //wait for the debugger to finish verifying the handshake
            expect(
                await bsDebugger.once('handshake-verified')
            ).to.be.false;
        });
    });

    describe('parseUnhandledData', () => {
        it('handles legacy handshake', () => {
            let mockResponse = createHandShakeResponse({
                magic: Debugger.DEBUGGER_MAGIC,
                major: 1,
                minor: 0,
                patch: 0
            });

            bsDebugger['unhandledData'] = mockResponse.toBuffer();

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(false);

            expect(bsDebugger['parseUnhandledData'](bsDebugger['unhandledData'])).to.be.equal(true);

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(true);
            expect(bsDebugger['unhandledData'].byteLength).to.be.equal(0);
        });

        it('handles v3 handshake', () => {
            let mockResponse = createHandShakeResponseV3({
                magic: Debugger.DEBUGGER_MAGIC,
                major: 3,
                minor: 0,
                patch: 0,
                revisionTimeStamp: Date.now()
            });

            bsDebugger['unhandledData'] = mockResponse.toBuffer();

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(false);

            expect(bsDebugger['parseUnhandledData'](bsDebugger['unhandledData'])).to.be.equal(true);

            expect(bsDebugger.watchPacketLength).to.be.equal(true);
            expect(bsDebugger.handshakeComplete).to.be.equal(true);
            expect(bsDebugger['unhandledData'].byteLength).to.be.equal(0);
        });

        it('handles events after handshake', () => {
            let handshake = createHandShakeResponseV3({
                magic: Debugger.DEBUGGER_MAGIC,
                major: 3,
                minor: 0,
                patch: 0,
                revisionTimeStamp: Date.now()
            });

            let protocolEvent = createProtocolEventV3({
                requestId: 0,
                errorCode: ERROR_CODES.CANT_CONTINUE,
                updateType: UPDATE_TYPES.ALL_THREADS_STOPPED
            });

            let mockResponse = new SmartBuffer();
            mockResponse.writeBuffer(handshake.toBuffer());
            mockResponse.writeBuffer(protocolEvent.toBuffer());

            bsDebugger['unhandledData'] = mockResponse.toBuffer();

            const stub = sinon.stub(bsDebugger as any, 'removedProcessedBytes').callThrough();

            expect(bsDebugger.watchPacketLength).to.be.equal(false);
            expect(bsDebugger.handshakeComplete).to.be.equal(false);

            expect(bsDebugger['parseUnhandledData'](bsDebugger['unhandledData'])).to.be.equal(true);

            expect(bsDebugger.watchPacketLength).to.be.equal(true);
            expect(bsDebugger.handshakeComplete).to.be.equal(true);
            expect(bsDebugger['unhandledData'].byteLength).to.be.equal(0);

            let calls = stub.getCalls();
            expect(calls[0].args[0]).instanceOf(HandshakeResponseV3);
            expect(calls[1].args[0]).instanceOf(ProtocolEventV3);
        });
    });

    describe('getVariables', () => {
        function getVariablesRequestBufferToJson(buffer: SmartBuffer) {
            const result = {
                flags: buffer.readUInt8(),
                threadIndex: buffer.readUInt32LE(),
                stackFrameIndex: buffer.readUInt32LE(),
                variablePathEntries: [],
                pathForceCaseInsensitive: []
            };

            const pathLength = buffer.readUInt32LE();
            if (pathLength > 0) {
                result.variablePathEntries = [];
                for (let i = 0; i < pathLength; i++) {
                    result.variablePathEntries.push(
                        buffer.readBufferNT().toString()
                    );
                }
            }
            // eslint-disable-next-line no-bitwise
            if (result.flags & VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS) {
                result.pathForceCaseInsensitive = [];
                for (let i = 0; i < pathLength; i++) {
                    result.pathForceCaseInsensitive.push(
                        buffer.readUInt8() === 0 ? false : true
                    );
                }
            }
            return result;
        }

        it('skips case sensitivity info on lower protocol versions', async () => {
            bsDebugger.protocolVersion = '2.0.0';
            bsDebugger['stopped'] = true;
            const stub = sinon.stub(bsDebugger as any, 'makeRequest').callsFake(() => { });
            await bsDebugger.getVariables(['m', 'top'], false, 1, 2);
            expect(
                getVariablesRequestBufferToJson(stub.getCalls()[0].args[0])
            ).to.eql({
                flags: 0,
                stackFrameIndex: 1,
                threadIndex: 2,
                variablePathEntries: ['m', 'top'],
                //should be empty
                pathForceCaseInsensitive: []
            });
        });

        it('marks strings as case-sensitive', async () => {
            bsDebugger.protocolVersion = '3.1.0';
            bsDebugger['stopped'] = true;
            const stub = sinon.stub(bsDebugger as any, 'makeRequest').callsFake(() => { });
            await bsDebugger.getVariables(['m', 'top', '"someKey"', '""someKeyWithInternalQuotes""'], true, 1, 2);
            expect(
                getVariablesRequestBufferToJson(stub.getCalls()[0].args[0])
            ).to.eql({
                // eslint-disable-next-line no-bitwise
                flags: VARIABLE_REQUEST_FLAGS.GET_CHILD_KEYS | VARIABLE_REQUEST_FLAGS.CASE_SENSITIVITY_OPTIONS,
                stackFrameIndex: 1,
                threadIndex: 2,
                variablePathEntries: ['m', 'top', 'someKey', '"someKeyWithInternalQuotes"'],
                //should be empty
                pathForceCaseInsensitive: [true, true, false, false]
            });
        });
    });
});
