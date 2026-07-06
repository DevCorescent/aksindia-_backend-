import { Router } from 'express';
import { adminController } from './admin.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

const adminOnly = [authenticate, requireRole('admin')];

/**
 * @openapi
 * tags:
 *   - name: Admin
 *     description: Administrative dashboard, user/role management and revenue reporting (admin only)
 */

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard statistics (users, stores, orders, revenue, pending withdrawals)
 *     responses:
 *       200: { description: Aggregated dashboard metrics }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/stats',          ...adminOnly, adminController.dashboardStats);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all user profiles
 *     responses:
 *       200: { description: Array of users }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/users',          ...adminOnly, adminController.listUsers);

/**
 * @openapi
 * /admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update a user profile
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User (profile) id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:      { type: string }
 *               role:      { type: string }
 *               is_active: { type: boolean }
 *               city:      { type: string }
 *               state:     { type: string }
 *     responses:
 *       200: { description: Updated user }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 *       500: { description: User not found or update failed }
 */
router.patch('/users/:id',    ...adminOnly, adminController.updateUser);

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a user profile
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: User (profile) id
 *     responses:
 *       204: { description: Deleted (no content) }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.delete('/users/:id',   ...adminOnly, adminController.deleteUser);

/**
 * @openapi
 * /admin/roles:
 *   get:
 *     tags: [Admin]
 *     summary: List custom roles
 *     responses:
 *       200: { description: Array of custom roles }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/roles',          ...adminOnly, adminController.listRoles);

/**
 * @openapi
 * /admin/roles:
 *   post:
 *     tags: [Admin]
 *     summary: Create a custom role
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, description, permissions, color]
 *             properties:
 *               name:        { type: string }
 *               description: { type: string }
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *               color:       { type: string }
 *     responses:
 *       201: { description: Created role }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/roles',         ...adminOnly, adminController.createRole);

/**
 * @openapi
 * /admin/roles/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Update a custom role
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Custom role id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:        { type: string }
 *               description: { type: string }
 *               permissions:
 *                 type: array
 *                 items: { type: string }
 *               color:       { type: string }
 *     responses:
 *       200: { description: Updated role }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 *       500: { description: Nothing to update or role not found }
 */
router.patch('/roles/:id',    ...adminOnly, adminController.updateRole);

/**
 * @openapi
 * /admin/roles/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a custom role
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Custom role id
 *     responses:
 *       204: { description: Deleted (no content) }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.delete('/roles/:id',   ...adminOnly, adminController.deleteRole);

/**
 * @openapi
 * /admin/revenue:
 *   get:
 *     tags: [Admin]
 *     summary: Revenue summary (paid orders and service orders)
 *     responses:
 *       200: { description: Revenue summary object }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.get('/revenue',        ...adminOnly, adminController.revenue);

export default router;
