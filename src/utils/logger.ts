import pino from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const VALID_LOG_LEVELS: LogLevel[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

function getLogLevel(): LogLevel {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (VALID_LOG_LEVELS.includes(level as LogLevel)) {
    return level as LogLevel;
  }
  console.warn(
    `Invalid LOG_LEVEL: ${level}. Using 'info'. Valid levels: ${VALID_LOG_LEVELS.join(', ')}`
  );
  return 'info';
}

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: getLogLevel(),
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
});

export default logger;
