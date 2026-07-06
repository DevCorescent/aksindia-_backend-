import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

const adminOnly = [authenticate, requireRole('admin')];

/**
 * @openapi
 * tags:
 *   - name: Analytics
 *     description: Activity tracking, revenue trends and reporting dashboards
 */

/**
 * @openapi
 * /analytics/activities:
 *   get:
 *     tags: [Analytics]
 *     summary: List recent user activities (latest 500)
 *     responses:
 *       200: { description: Array of user activities }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/activities',      ...adminOnly, analyticsController.activities);

/**
 * @openapi
 * /analytics/abandoned-carts:
 *   get:
 *     tags: [Analytics]
 *     summary: List abandoned carts
 *     responses:
 *       200: { description: Array of abandoned carts }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/abandoned-carts', ...adminOnly, analyticsController.abandonedCarts);

/**
 * @openapi
 * /analytics/revenue-trend:
 *   get:
 *     tags: [Analytics]
 *     summary: Daily revenue trend from paid orders
 *     parameters:
 *       - in: query
 *         name: days
 *         required: false
 *         schema: { type: integer, default: 30 }
 *         description: Number of days to look back (default 30)
 *     responses:
 *       200: { description: Array of daily revenue/order points }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/revenue-trend',   ...adminOnly, analyticsController.revenueTrend);

/**
 * @openapi
 * /analytics/top-products:
 *   get:
 *     tags: [Analytics]
 *     summary: Top selling products
 *     parameters:
 *       - in: query
 *         name: limit
 *         required: false
 *         schema: { type: integer, default: 10 }
 *         description: Max number of products to return (default 10)
 *     responses:
 *       200: { description: Array of top products with sales/revenue }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/top-products',    ...adminOnly, analyticsController.topProducts);

/**
 * @openapi
 * /analytics/events:
 *   get:
 *     tags: [Analytics]
 *     summary: Event counts over the last 30 days
 *     responses:
 *       200: { description: Array of event/count pairs }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/events',          ...adminOnly, analyticsController.eventSummary);

/**
 * @openapi
 * /analytics/track:
 *   post:
 *     tags: [Analytics]
 *     summary: Record a user activity event
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, event]
 *             properties:
 *               userId:    { type: string }
 *               userName:  { type: string }
 *               userEmail: { type: string }
 *               userRole:  { type: string }
 *               event:     { type: string }
 *               page:      { type: string }
 *               metadata:  { type: object }
 *               sessionId: { type: string }
 *     responses:
 *       201: { description: Activity tracked }
 *       401: { description: Missing/invalid token }
 */
router.post('/track',           authenticate, analyticsController.track);

export default router;
