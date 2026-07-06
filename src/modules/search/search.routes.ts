import { Router } from 'express';
import { searchService } from './search.service';
import { ok, badRequest, serverError } from '../../utils/response';
import type { Request, Response } from 'express';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Search
 *     description: Global search and autocomplete suggestions
 */

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Global search across the catalogue
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search query (required, non-empty)
 *       - in: query
 *         name: city
 *         required: false
 *         schema: { type: string }
 *         description: Optional city filter
 *     responses:
 *       200: { description: Search results }
 *       400: { description: q query param required }
 *       500: { description: Search error }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q?.trim()) { badRequest(res, 'q query param required'); return; }
    ok(res, await searchService.global(q.trim(), req.query.city as string | undefined));
  } catch (e) { serverError(res, (e as Error).message); }
});

/**
 * @openapi
 * /search/suggest:
 *   get:
 *     tags: [Search]
 *     summary: Autocomplete suggestions for a partial query
 *     security: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema: { type: string }
 *         description: Partial query; empty/blank returns an empty array
 *       - in: query
 *         name: city
 *         required: false
 *         schema: { type: string }
 *         description: Optional city filter
 *     responses:
 *       200: { description: Array of suggestions }
 *       500: { description: Search error }
 */
router.get('/suggest', async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q?.trim()) { ok(res, []); return; }
    ok(res, await searchService.suggestions(q.trim(), req.query.city as string | undefined));
  } catch (e) { serverError(res, (e as Error).message); }
});

export default router;
