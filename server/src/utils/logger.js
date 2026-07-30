// server/src/utils/logger.js
// winston: console + rotating-by-size file transports under storage/logs.
// Log level follows NODE_ENV: verbose in dev, quiet in test, info in prod.
import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import { env, REPO_ROOT } from '../config/env.js';

const LOG_DIR = path.join(REPO_ROOT, 'storage', 'logs');

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // best-effort — if storage/logs can't be created, file transport below
  // will surface the error itself rather than crashing the process here.
}

function levelForEnv() {
  if (env.NODE_ENV === 'production') return 'info';
  if (env.NODE_ENV === 'test') return 'error';
  return 'debug';
}

const logger = winston.createLogger({
  level: levelForEnv(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'sams-academy-server' },
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
  exitOnError: false,
});

if (env.NODE_ENV !== 'test') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    })
  );
}

export default logger;
