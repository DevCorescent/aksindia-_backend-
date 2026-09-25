import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // express.json() rejects bodies it cannot accept with a 4xx: pass that status
  // on (with a fixed message) instead of reporting the client's mistake as a 500.
  const bodyError = (err as Error & { type?: string }).type;
  if (bodyError === 'entity.parse.failed') { res.status(400).json({ success: false, error: 'Request body is not valid JSON' }); return; }
  if (bodyError === 'entity.too.large')    { res.status(413).json({ success: false, error: 'Request body is too large' }); return; }
  console.error(err.message, err.stack);
  res.status(500).json({ success: false, error: err.message ?? 'Internal server error' });
}
