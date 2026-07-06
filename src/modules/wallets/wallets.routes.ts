import { Router } from 'express';
import { walletsController } from './wallets.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Wallets
 *     description: User wallet balances and transactions
 */

/**
 * @openapi
 * /wallets/me:
 *   get:
 *     tags: [Wallets]
 *     summary: Get the logged-in user's wallet plus transaction history
 *     responses:
 *       200:
 *         description: Wallet and its transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     wallet:       { type: object }
 *                     transactions: { type: array, items: { type: object } }
 *       401: { description: Missing/invalid token }
 */
router.get('/me',      authenticate, walletsController.getMyWallet);

/**
 * @openapi
 * /wallets/credit:
 *   post:
 *     tags: [Wallets]
 *     summary: Credit money into any wallet (admin) — atomic, writes a ledger row
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, amount, description]
 *             properties:
 *               userId:      { type: string, format: uuid }
 *               amount:      { type: number, minimum: 0.01 }
 *               description: { type: string, example: Bonus payout }
 *               referenceId: { type: string, example: ORD123, description: Optional link to a source record }
 *     responses:
 *       200: { description: Credited }
 *       403: { description: Not an admin }
 */
router.post('/credit', authenticate, requireRole('admin'), walletsController.credit);

/**
 * @openapi
 * /wallets/ensure:
 *   post:
 *     tags: [Wallets]
 *     summary: Create a wallet if one does not exist (idempotent) — call after signup
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string, format: uuid, description: Defaults to the caller's id if omitted }
 *     responses:
 *       201: { description: Wallet ensured }
 */
router.post('/ensure', authenticate, walletsController.ensure);

export default router;
