// Structured JSON logger with correlation ID, severity, and namespace support.
// Writes to stdout in production (picked up by log aggregators) and colorizes in dev.

type Level = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts:            string;
  level:         Level;
  ns:            string;
  msg:           string;
  correlationId?: string;
  durationMs?:   number;
  [key: string]: unknown;
}

const IS_DEV = process.env.NODE_ENV !== "production";

const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL ?? "info") as Level;

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[MIN_LEVEL];
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return;
  if (IS_DEV) {
    const colors: Record<Level, string> = {
      debug: "\x1b[37m",
      info:  "\x1b[36m",
      warn:  "\x1b[33m",
      error: "\x1b[31m",
    };
    const reset = "\x1b[0m";
    const { ts, level, ns, msg, correlationId, durationMs, ...rest } = entry;
    const meta = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
    const dur  = durationMs !== undefined ? ` +${durationMs}ms` : "";
    const cid  = correlationId ? ` [${correlationId.slice(0, 8)}]` : "";
    console.log(`${colors[level]}${level.toUpperCase()}${reset} [${ns}]${cid} ${msg}${dur}${meta}`);
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string,  meta?: Record<string, unknown>): void;
  warn(msg: string,  meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(overrides: { correlationId?: string; [k: string]: unknown }): Logger;
  timer(): () => number;
}

function makeLogger(ns: string, defaults: Record<string, unknown> = {}): Logger {
  function log(level: Level, msg: string, meta?: Record<string, unknown>): void {
    emit({ ts: new Date().toISOString(), level, ns, msg, ...defaults, ...meta });
  }

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info:  (msg, meta) => log("info",  msg, meta),
    warn:  (msg, meta) => log("warn",  msg, meta),
    error: (msg, meta) => log("error", msg, meta),
    child: (overrides) => makeLogger(ns, { ...defaults, ...overrides }),
    timer: () => {
      const start = Date.now();
      return () => Date.now() - start;
    },
  };
}

export function createLogger(namespace: string): Logger {
  return makeLogger(namespace);
}

// Correlation ID propagation via AsyncLocalStorage (Node.js only).
// Import from this module and call withCorrelationId() in route handlers / job processors.
import { AsyncLocalStorage } from "async_hooks";

const store = new AsyncLocalStorage<{ correlationId: string }>();

export function withCorrelationId<T>(id: string, fn: () => T): T {
  return store.run({ correlationId: id }, fn);
}

export function getCorrelationId(): string | undefined {
  return store.getStore()?.correlationId;
}

export function correlationLogger(namespace: string): Logger {
  const base = makeLogger(namespace);
  // Proxy that injects the current async context's correlation ID automatically
  return {
    debug: (msg, meta) => base.debug(msg, { correlationId: getCorrelationId(), ...meta }),
    info:  (msg, meta) => base.info( msg, { correlationId: getCorrelationId(), ...meta }),
    warn:  (msg, meta) => base.warn( msg, { correlationId: getCorrelationId(), ...meta }),
    error: (msg, meta) => base.error(msg, { correlationId: getCorrelationId(), ...meta }),
    child: (overrides) => base.child({ correlationId: getCorrelationId(), ...overrides }),
    timer: ()          => base.timer(),
  };
}
