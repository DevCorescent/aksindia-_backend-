import { Router } from 'express';
import { serviceOrdersController } from './service-orders.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: ServiceOrders
 *     description: Service bookings and their fulfilment lifecycle
 */

/**
 * @openapi
 * /service-orders:
 *   get:
 *     tags: [ServiceOrders]
 *     summary: List service orders
 *     description: >-
 *       Results are role-scoped: a customer sees only their own bookings,
 *       a service_provider sees bookings assigned to them, an agent sees
 *       bookings tied to their agent id. Admins (and any other role) see all.
 *       Ordered by creation date, newest first.
 *     responses:
 *       200: { description: List of service orders }
 *       401: { description: Missing/invalid token }
 */
router.get('/',                  authenticate, serviceOrdersController.list);
/**
 * @openapi
 * /service-orders/{id}:
 *   get:
 *     tags: [ServiceOrders]
 *     summary: Get a service order by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Service order id
 *     responses:
 *       200: { description: The requested service order }
 *       401: { description: Missing/invalid token }
 *       500: { description: Service order not found }
 */
router.get('/:id',               authenticate, serviceOrdersController.getById);
/**
 * @openapi
 * /service-orders:
 *   post:
 *     tags: [ServiceOrders]
 *     summary: Create a service order
 *     description: >-
 *       Books a service. Generates a human-readable order id and starts the
 *       order in `pending` status. Optional agent fields attribute a commission
 *       to a referring agent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, serviceTitle, providerId, providerName, customerId, customerName, customerEmail, amount, scheduledDate, address, city]
 *             properties:
 *               serviceId:       { type: string }
 *               serviceTitle:    { type: string }
 *               serviceIcon:     { type: string }
 *               serviceColor:    { type: string }
 *               providerId:      { type: string }
 *               providerName:    { type: string }
 *               customerId:      { type: string }
 *               customerName:    { type: string }
 *               customerEmail:   { type: string }
 *               customerPhone:   { type: string }
 *               amount:          { type: number }
 *               scheduledDate:   { type: string, format: date-time }
 *               address:         { type: string }
 *               city:            { type: string }
 *               notes:           { type: string }
 *               agentId:         { type: string }
 *               agentName:       { type: string }
 *               agentCode:       { type: string }
 *               agentCommission: { type: number }
 *     responses:
 *       201: { description: Service order created }
 *       401: { description: Missing/invalid token }
 *       500: { description: Create failed }
 */
router.post('/',                 authenticate, serviceOrdersController.create);
/**
 * @openapi
 * /service-orders/{id}:
 *   patch:
 *     tags: [ServiceOrders]
 *     summary: Update a service order
 *     description: Admin or service_provider only. Applies any supplied fields.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Service order id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:        { type: string }
 *               scheduledDate: { type: string, format: date-time }
 *               notes:         { type: string }
 *     responses:
 *       200: { description: Updated service order }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or service_provider }
 *       500: { description: Service order not found }
 */
router.patch('/:id',             authenticate, requireRole('admin', 'service_provider'), serviceOrdersController.update);
/**
 * @openapi
 * /service-orders/{id}/complete:
 *   post:
 *     tags: [ServiceOrders]
 *     summary: Mark a service order completed
 *     description: >-
 *       Admin or service_provider only. Sets status to `completed`, credits the
 *       provider wallet (amount minus agent commission), credits any referring
 *       agent, and notifies the customer. Fails if already completed or
 *       cancelled.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Service order id
 *     responses:
 *       200: { description: Completed service order }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or service_provider }
 *       500: { description: Service order not found or already finalized }
 */
router.post('/:id/complete',     authenticate, requireRole('admin', 'service_provider'), serviceOrdersController.complete);
/**
 * @openapi
 * /service-orders/{id}/cancel:
 *   post:
 *     tags: [ServiceOrders]
 *     summary: Cancel a service order
 *     description: >-
 *       Marks the order cancelled, appends the reason to its notes, and notifies
 *       the other party (customer or provider). Fails if already completed or
 *       cancelled.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Service order id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Cancelled service order }
 *       400: { description: reason is required }
 *       401: { description: Missing/invalid token }
 *       500: { description: Service order not found or already finalized }
 */
router.post('/:id/cancel',       authenticate, serviceOrdersController.cancel);
/**
 * @openapi
 * /service-orders/{id}/reject:
 *   post:
 *     tags: [ServiceOrders]
 *     summary: Reject a pending service order
 *     description: >-
 *       Service_provider or admin only. Sets status to `rejected` and notifies
 *       the customer with the reason. Only valid while the order is `pending`.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Service order id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200: { description: Rejected service order }
 *       400: { description: reason is required }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not a service_provider or admin }
 *       500: { description: Service order not found or not in pending state }
 */
router.post('/:id/reject',       authenticate, requireRole('service_provider', 'admin'), serviceOrdersController.reject);

export default router;
