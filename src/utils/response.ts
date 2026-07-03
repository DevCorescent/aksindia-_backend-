import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ success: true, data });
}

export function noContent(res: Response): void {
  res.status(204).send();
}

export function badRequest(res: Response, message: string): void {
  res.status(400).json({ success: false, error: message });
}

export function unauthorized(res: Response, message = 'Unauthorized'): void {
  res.status(401).json({ success: false, error: message });
}

export function forbidden(res: Response, message = 'Forbidden'): void {
  res.status(403).json({ success: false, error: message });
}

export function notFound(res: Response, message = 'Not found'): void {
  res.status(404).json({ success: false, error: message });
}

export function serverError(res: Response, message = 'Internal server error'): void {
  res.status(500).json({ success: false, error: message });
}
