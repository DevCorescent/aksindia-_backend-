import { Router } from 'express';
import { ordersController } from './orders.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Orders
 *     description: Product orders and their fulfilment lifecycle
 */

/**
 * @openapi
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: List orders
 *     description: >-
 *       Results are role-scoped: a customer sees only their own orders,
 *       a store_owner sees orders for their store, an agent sees orders tied
 *       to their agent id. Admins (and any other role) see all orders.
 *       Ordered by creation date, newest first.
 *     responses:
 *       200: { description: List of orders }
 *       401: { description: Missing/invalid token }
 */
router.get('/',             authenticate, ordersController.list);
/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get an order by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order id
 *     responses:
 *       200: { description: The requested order }
 *       401: { description: Missing/invalid token }
 *       500: { description: Order not found }
 */
router.get('/:id',          authenticate, ordersController.getById);
/**
 * @openapi
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create an order
 *     description: >-
 *       Persists the order, generates a human-readable order id, and decrements
 *       product stock for each line item. Optional agent fields attribute a
 *       commission to a referring agent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, customerName, customerEmail, items, subtotal, total, commissionTotal, adminRevenue, address, city]
 *             properties:
 *               customerId:      { type: string }
 *               customerName:    { type: string }
 *               customerEmail:   { type: string }
 *               storeId:         { type: string, description: Store UUID (ignored if not a valid UUID) }
 *               storeName:       { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId: { type: string }
 *                     quantity:  { type: integer }
 *               subtotal:        { type: number }
 *               total:           { type: number }
 *               commissionTotal: { type: number }
 *               adminRevenue:    { type: number }
 *               discount:        { type: number, default: 0 }
 *               shippingCharge:  { type: number, default: 0 }
 *               gstAmount:       { type: number, default: 0 }
 *               status:          { type: string, default: pending }
 *               paymentMethod:   { type: string, default: cod }
 *               paymentStatus:   { type: string, default: pending }
 *               address:         { type: string }
 *               city:            { type: string }
 *               agentId:         { type: string }
 *               agentName:       { type: string }
 *               agentCode:       { type: string }
 *               agentCommission: { type: number }
 *     responses:
 *       201: { description: Order created }
 *       401: { description: Missing/invalid token }
 *       500: { description: Create failed }
 */
router.post('/',            authenticate, ordersController.create);
/**
 * @openapi
 * /orders/{id}:
 *   patch:
 *     tags: [Orders]
 *     summary: Update an order
 *     description: >-
 *       Admin or store_owner only. Applies any supplied fields. When status
 *       transitions to `delivered` and paymentStatus is `paid`, the store and
 *       any referring agent wallets are credited.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:         { type: string }
 *               paymentStatus:  { type: string }
 *               paymentMethod:  { type: string }
 *               trackingNumber: { type: string }
 *               courierName:    { type: string }
 *               cancelReason:   { type: string }
 *     responses:
 *       200: { description: Updated order }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or store_owner }
 *       500: { description: Order not found }
 */
router.patch('/:id',        authenticate, requireRole('admin', 'store_owner', 'delivery_partner'), ordersController.update);
/**
 * @openapi
 * /orders/{id}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel an order
 *     description: >-
 *       Marks the order cancelled with the supplied reason. Fails if the order
 *       is already delivered or cancelled.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Order id
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
 *       200: { description: Cancelled order }
 *       400: { description: reason is required }
 *       401: { description: Missing/invalid token }
 *       500: { description: Order not found or cannot be cancelled }
 */
router.post('/:id/cancel',  authenticate, ordersController.cancel);

export default router;
