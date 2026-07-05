import { Router } from 'express';
import { searchService } from './search.service';
import { ok, badRequest, serverError } from '../../utils/response';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q?.trim()) { badRequest(res, 'q query param required'); return; }
    ok(res, await searchService.global(q.trim(), req.query.city as string | undefined));
  } catch (e) { serverError(res, (e as Error).message); }
});

router.get('/suggest', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q?.trim()) { ok(res, []); return; }
    ok(res, await searchService.suggestions(q.trim(), req.query.city as string | undefined));
  } catch (e) { serverError(res, (e as Error).message); }
});

export default router;
