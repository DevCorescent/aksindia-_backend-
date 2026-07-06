import { Router } from 'express';
import { agentsController } from './agents.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Agents
 *     description: Sales/referral agent management
 */

/**
 * @openapi
 * /agents:
 *   get:
 *     tags: [Agents]
 *     summary: List all agents (admin)
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [pending, active, suspended] }
 *         description: Optional filter by agent status
 *     responses:
 *       200: { description: Array of agents with joined profile info }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/',                authenticate, requireRole('admin'), agentsController.list);

/**
 * @openapi
 * /agents/code/{code}:
 *   get:
 *     tags: [Agents]
 *     summary: Look up an agent by their code (e.g. AGT001) — used at checkout
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The agent }
 *       500: { description: Agent not found }
 */
router.get('/code/:code',      authenticate, agentsController.getByCode);

/**
 * @openapi
 * /agents/{id}:
 *   get:
 *     tags: [Agents]
 *     summary: Get a single agent by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The agent }
 *       500: { description: Agent not found }
 */
router.get('/:id',             authenticate, agentsController.getById);

/**
 * @openapi
 * /agents/{id}/earnings:
 *   get:
 *     tags: [Agents]
 *     summary: Get an agent's earnings summary
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Earnings totals for the agent }
 */
router.get('/:id/earnings',    authenticate, agentsController.earnings);

/**
 * @openapi
 * /agents:
 *   post:
 *     tags: [Agents]
 *     summary: Create an agent from an existing user profile (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId, agentCode, commissionRate, status]
 *             properties:
 *               agentId:        { type: string, format: uuid, description: Existing profile id }
 *               agentCode:      { type: string, example: AGT001 }
 *               commissionRate: { type: number, minimum: 0, maximum: 30, example: 10 }
 *               status:         { type: string, enum: [pending, active, suspended] }
 *     responses:
 *       201: { description: Agent created }
 */
router.post('/',               authenticate, requireRole('admin'), agentsController.create);

/**
 * @openapi
 * /agents/{id}/approve:
 *   post:
 *     tags: [Agents]
 *     summary: Approve/activate a pending agent (admin) — records the approving admin
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The activated agent }
 */
router.post('/:id/approve',    authenticate, requireRole('admin'), agentsController.approve);

/**
 * @openapi
 * /agents/{id}/reject:
 *   post:
 *     tags: [Agents]
 *     summary: Reject an agent (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: The rejected agent }
 */
router.post('/:id/reject',     authenticate, requireRole('admin'), agentsController.reject);

/**
 * @openapi
 * /agents/{id}:
 *   patch:
 *     tags: [Agents]
 *     summary: Update an agent (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:         { type: string, enum: [pending, active, suspended] }
 *               commissionRate: { type: number }
 *     responses:
 *       200: { description: The updated agent }
 */
router.patch('/:id',           authenticate, requireRole('admin'), agentsController.update);

export default router;
