import logger, { FileTransport } from '@rokucommunity/logger';
import { QueuedTransport } from '@rokucommunity/logger/dist/transports/QueuedTransport';

export const fileTransport = new FileTransport();
//add transport immediately so we can queue log entries
logger.addTransport(fileTransport);

export const debugServerLogOutputEventTransport = new QueuedTransport();
//add transport immediately so we can queue log entries
logger.addTransport(debugServerLogOutputEventTransport);

logger.logLevel = 'log';

export { logger };
export type { Logger, LogMessage, LogLevel } from '@rokucommunity/logger';
