import { FileTransport, default as defaultLogger } from '@rokucommunity/logger';
import { QueuedTransport } from '@rokucommunity/logger/dist/transports/QueuedTransport';

const logger = defaultLogger.createLogger('[roku-debug]');

export const debugServerLogOutputEventTransport = new QueuedTransport();
//add transport immediately so we can queue log entries
logger.addTransport(debugServerLogOutputEventTransport);

logger.logLevel = 'log';

export { logger };
export type { Logger, LogMessage, LogLevel } from '@rokucommunity/logger';
