
export class SocketConnectionInUseError extends Error {
    constructor(message: string, options: { port: number; host: string }) {
        super(message);
        this.port = options.port;
        this.host = options.host;
        Object.setPrototypeOf(this, SocketConnectionInUseError.prototype);
    }

    public port: number;
    public host: string;
}
