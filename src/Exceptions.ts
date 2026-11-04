
export class SocketConnectionInUseError extends Error {
    constructor(message: string, options: { port: number; host: string }) {
        super(message);
        this.port = options.port;
        this.host = options.host;
        Object.setPrototypeOf(this, SocketConnectionInUseError.prototype);
    }

    public port: number;
    /**
     * A label identifying the device the connection was made to: the host for a local device, or
     * the instanceUrl/id/esn for a Roku Cloud Emulator device.
     */
    public host: string;
}
