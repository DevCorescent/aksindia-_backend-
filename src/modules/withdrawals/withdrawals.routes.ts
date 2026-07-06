import { Router } from 'express';
import { withdrawalsController } from './withdrawals.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Withdrawals
 *     description: Payout requests and their approval/settlement lifecycle
 */

/**
 * @openapi
 * /withdrawals:
 *   get:
 *     tags: [Withdrawals]
 *     summary: List withdrawal requests
 *     description: Admins see all requests; other roles see only their own.
 *     responses:
 *       200: { description: Array of withdrawal requests }
 *       401: { description: Missing/invalid token }
 */
router.get('/',      authenticate, withdrawalsController.list);

/**
 * @openapi
 * /withdrawals:
 *   post:
 *     tags: [Withdrawals]
 *     summary: Create a withdrawal request (holds funds balance to pending)
 *     description: >
 *       Always created with status "pending". Non-admins may only withdraw from
 *       their own account. The amount is held (balance to pending) atomically;
 *       if the wallet lacks the balance, nothing is created. Minimum amount 500.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entityType, entityId, amount, bankAccount, ifsc]
 *             properties:
 *               entityType:  { type: string, enum: [agent, service_provider, store] }
 *               entityId:    { type: string, format: uuid }
 *               entityName:  { type: string }
 *               ownerName:   { type: string }
 *               amount:      { type: number, minimum: 500 }
 *               bankAccount: { type: string }
 *               ifsc:        { type: string }
 *     responses:
 *       201: { description: Request created and funds held }
 *       500: { description: "Validation, ownership, or insufficient-balance error" }
 */
router.post('/',     authenticate, withdrawalsController.create);

/**
 * @openapi
 * /withdrawals/{id}:
 *   patch:
 *     tags: [Withdrawals]
 *     summary: Change a withdrawal's status (admin) — moves money accordingly
 *     description: >
 *       approved = status only (funds stay held); processed = pending to withdrawn
 *       (payout leaves); rejected = pending to balance (funds returned). A request
 *       that is already processed/rejected cannot transition again.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [approved, rejected, processed] }
 *               note:   { type: string }
 *     responses:
 *       200: { description: The updated withdrawal request }
 *       403: { description: Not an admin }
 *       500: { description: Not found or invalid transition }
 */
router.patch('/:id', authenticate, requireRole('admin'), withdrawalsController.update);

export default router;
