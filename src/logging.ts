import { default as defaultLogger } from '@rokucommunity/logger';
import type { Logger } from '@rokucommunity/logger';
import { QueuedTransport } from '@rokucommunity/logger/dist/transports/QueuedTransport';
const logger = defaultLogger.createLogger('[roku-debug]');

//disable colors
logger.enableColor = false;
//force log levels to be same width
logger.consistentLogLevelWidth = true;

export const debugServerLogOutputEventTransport = new QueuedTransport();
//add transport immediately so we can queue log entries
logger.addTransport(debugServerLogOutputEventTransport);

logger.logLevel = 'log';
const createLogger = logger.createLogger.bind(logger) as typeof Logger.prototype.createLogger;

export { logger, createLogger };
export type { Logger, LogMessage, LogLevel } from '@rokucommunity/logger';
