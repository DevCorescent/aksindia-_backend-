type Level = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function log(level: Level, tag: string, msg: string, meta?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}] [${tag}] ${msg}`;
  if (meta && Object.keys(meta).length > 0) {
    const safe = JSON.stringify(meta, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    console.log(`${base} | ${safe}`);
  } else {
    console.log(base);
  }
}

export const logger = {
  info:  (tag: string, msg: string, meta?: Record<string, unknown>) => log('INFO',  tag, msg, meta),
  warn:  (tag: string, msg: string, meta?: Record<string, unknown>) => log('WARN',  tag, msg, meta),
  error: (tag: string, msg: string, meta?: Record<string, unknown>) => log('ERROR', tag, msg, meta),
  debug: (tag: string, msg: string, meta?: Record<string, unknown>) => log('DEBUG', tag, msg, meta),
};
