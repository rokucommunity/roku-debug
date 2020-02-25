import * as rokuDeploy from 'roku-deploy';
import * as Net from 'net';

// The port number and hostname of the server.
import { DebuggerRequestResponse } from './DebuggerRequestResponse';
import { DebuggerVariableRequestResponse } from './DebuggerVariableRequestResponse';
import { DebuggerUpdateThreads } from './DebuggerUpdateThreads';
import { DebuggerUpdateUndefined } from './DebuggerUpdateUndefined';
import { DebuggerUpdateConnectIoPort } from './DebuggerUpdateConnectIoPort';
import { DebuggerHandshake } from './DebuggerHandshake';
import { util } from './util';

const CONTROLLER_PORT = 8081;
const DEBUGGER_MAGIC = 'bsdebug\0'; // 64-bit = [b'bsdebug\0' little-endian]

export class BrightscriptDebugger {
  public scriptTitle: string;
  public host: string;
  public handshakeComplete = false;
  public protocolVersion = [];

  private CONTROLLER_CLIENT: Net.Socket;
  private unhandledData: Buffer;
  private firstRunContinueFired = false;
  private requests = ['nill'];

  public async start(applicationDeployConfig: any) {
    console.log('start - SocketDebugger');
    const debugSetupEnd = 'total socket debugger setup time';
    console.time(debugSetupEnd);

    // Enable the remoteDebug option.
    applicationDeployConfig.remoteDebug = true;

    this.host = applicationDeployConfig.host;

    await rokuDeploy.deploy(applicationDeployConfig);

    (async () => {
      // Create a new TCP client.`
      this.CONTROLLER_CLIENT = new Net.Socket();
      // Send a connection request to the server.
      console.log('port', CONTROLLER_PORT, 'host', applicationDeployConfig.host);
      this.CONTROLLER_CLIENT.connect({ port: CONTROLLER_PORT, host: applicationDeployConfig.host }, () => {
        // If there is no error, the server has accepted the request and created a new
        // socket dedicated to us.
        console.log('TCP connection established with the server.');

        // The client can also receive data from the server by reading from its socket.
        // The client can now send data to the server by writing to its socket.
        this.CONTROLLER_CLIENT.write(Buffer.from(DEBUGGER_MAGIC));
        console.log(this.CONTROLLER_CLIENT);
      });

      this.CONTROLLER_CLIENT.on('data', (buffer) => {
        if (this.unhandledData) {
          this.unhandledData = Buffer.concat([this.unhandledData, buffer]);
        } else {
          this.unhandledData = buffer;
        }

        this.parseUnhandledData(this.unhandledData);
      });

      this.CONTROLLER_CLIENT.on('end', () => {
        console.log('Requested an end to the TCP connection');
      });

      // Don't forget to catch error, for your own sake.
      this.CONTROLLER_CLIENT.on('error', function(err) {
        console.log(`Error: ${err}`);
      });
    })();

    console.timeEnd(debugSetupEnd);
  }

  private parseUnhandledData(unhandledData: Buffer): boolean {
    if (this.handshakeComplete) {
      let debuggerRequestResponse = new DebuggerRequestResponse(unhandledData);
      if (debuggerRequestResponse.success) {
        console.log(this.requests[debuggerRequestResponse.requestId]);
        if (this.requests[debuggerRequestResponse.requestId] === 'STOP' || this.requests[debuggerRequestResponse.requestId] === 'CONTINUE') {
          this.removedProcessedBytes(debuggerRequestResponse, unhandledData);
          return true;
        }

        if (this.requests[debuggerRequestResponse.requestId] === 'VARIABLES') {
          let debuggerVariableRequestResponse = new DebuggerVariableRequestResponse(unhandledData);
          if (debuggerVariableRequestResponse.success) {
            this.removedProcessedBytes(debuggerVariableRequestResponse, unhandledData);
            return true;
          }
        }
      }

      let debuggerUpdateThreads = new DebuggerUpdateThreads(unhandledData);
      if (debuggerUpdateThreads.success) {
        this.handleThreadsUpdate(debuggerUpdateThreads);
        this.removedProcessedBytes(debuggerUpdateThreads, unhandledData);
        return true;
      }

      let debuggerUpdateUndefined = new DebuggerUpdateUndefined(unhandledData);
      if (debuggerUpdateUndefined.success) {
        this.removedProcessedBytes(debuggerUpdateUndefined, unhandledData);
        return true;
      }

      let debuggerUpdateConnectIoPort = new DebuggerUpdateConnectIoPort(unhandledData);
      if (debuggerUpdateConnectIoPort.success) {
        this.connectToIoPort(debuggerUpdateConnectIoPort);
        this.removedProcessedBytes(debuggerUpdateConnectIoPort, unhandledData);
        return true;
      }

    } else {
      let debuggerHandshake = new DebuggerHandshake(unhandledData);
      if (debuggerHandshake.success) {
        return this.verifyHandshake(debuggerHandshake, unhandledData);
      }
    }

    return false;
  }

  private removedProcessedBytes(responseHandler, unhandledData: Buffer) {
    console.log(responseHandler);
    this.unhandledData = unhandledData.slice(responseHandler.byteLength);
    this.parseUnhandledData(this.unhandledData);
  }

  private verifyHandshake(debuggerHandshake: DebuggerHandshake, unhandledData: Buffer): boolean {
    const magicIsValid = (DEBUGGER_MAGIC === debuggerHandshake.magic);
    if (magicIsValid) {
      console.log('Magic is valid.');
      this.protocolVersion = [debuggerHandshake.majorVersion, debuggerHandshake.minorVersion, debuggerHandshake.patchVersion, ''];
      console.log('Protocol Version:', this.protocolVersion.join('.'));

      this.handshakeComplete = true;
      this.removedProcessedBytes(debuggerHandshake, unhandledData);
      return true;
    } else {
      console.log('Closing connection due to bad debugger magic', debuggerHandshake.magic)
      this.CONTROLLER_CLIENT.end();
      return false;
    }
  }

  private connectToIoPort(connectIoPortResponse: DebuggerUpdateConnectIoPort) {
    // Create a new TCP client.
    const IO_CLIENT = new Net.Socket();
    // Send a connection request to the server.
    console.log('Connect to IO Port: port', connectIoPortResponse.data, 'host', this.host);
    IO_CLIENT.connect({ port: connectIoPortResponse.data, host: this.host }, () => {
      // If there is no error, the server has accepted the request
      console.log('TCP connection established with the IO Port.');

      let lastPartialLine = '';
      IO_CLIENT.on('data', (buffer) => {
        let responseText = buffer.toString();
        if (!responseText.endsWith('\n')) {
          // buffer was split, save the partial line
          lastPartialLine += responseText;
        } else {
          if (lastPartialLine) {
              // there was leftover lines, join the partial lines back together
              responseText = lastPartialLine + responseText;
              lastPartialLine = '';
          }

          console.log(responseText.trim());
        }
      });

      IO_CLIENT.on('end', () => {
        console.log('Requested an end to the IO connection');
      });

      // Don't forget to catch error, for your own sake.
      IO_CLIENT.on('error', (err) => {
        console.log(`Error: ${err}`);
      });
    });
  }

  private handleThreadsUpdate(update) {
    if (update.updateType === 'ALL_THREADS_STOPPED') {
      if (!this.firstRunContinueFired) {
        console.log('Sending first run continue command');
        // TODO: remove temporary code
        let buffer = Buffer.alloc(12, 0);
        buffer.writeUInt32LE(12, 0);
        buffer.writeUInt32LE(1, 4);
        buffer.writeUInt32LE(2, 8);

        this.requests.push('CONTINUE');
        this.CONTROLLER_CLIENT.write(buffer);
        this.firstRunContinueFired = true;
      } else {
        // TODO: remove temporary code
        let buffer = Buffer.alloc(25, 0);
        buffer.writeUInt32LE(25, 0);
        buffer.writeUInt32LE(2, 4);
        buffer.writeUInt32LE(5, 8);
        buffer.writeUInt8(0x01, 12);
        buffer.writeUInt32LE(update.data.primaryThreadIndex, 13);
        buffer.writeUInt32LE(0, 17);
        buffer.writeUInt32LE(0, 21);

        this.requests.push('VARIABLES');
        this.CONTROLLER_CLIENT.write(buffer);
      }
    } else {
    }
  }
}
