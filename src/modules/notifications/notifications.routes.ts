import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Notifications
 *     description: Per-user notifications and admin broadcasts
 */

/**
 * @openapi
 * /notifications/me:
 *   get:
 *     tags: [Notifications]
 *     summary: List the current user's notifications
 *     description: Returns up to the 100 most recent notifications for the authenticated user, newest first.
 *     responses:
 *       200: { description: List of notifications }
 *       401: { description: Missing/invalid token }
 */
router.get('/me',              authenticate, notificationsController.list);
/**
 * @openapi
 * /notifications/me/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Count the current user's unread notifications
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *       401: { description: Missing/invalid token }
 */
router.get('/me/unread-count', authenticate, notificationsController.countUnread);
/**
 * @openapi
 * /notifications/me/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all of the current user's notifications as read
 *     responses:
 *       200: { description: All marked read }
 *       401: { description: Missing/invalid token }
 */
router.patch('/me/read-all',   authenticate, notificationsController.markAllRead);
/**
 * @openapi
 * /notifications:
 *   post:
 *     tags: [Notifications]
 *     summary: Send a notification to a single user
 *     description: Admin only. Delivers a notification to the user identified by userId.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, type, title, message]
 *             properties:
 *               userId:  { type: string, description: Recipient user id }
 *               type:    { type: string }
 *               title:   { type: string }
 *               message: { type: string }
 *               link:    { type: string }
 *     responses:
 *       201: { description: Notification sent }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/',               authenticate, requireRole('admin'), notificationsController.create);
/**
 * @openapi
 * /notifications/broadcast:
 *   post:
 *     tags: [Notifications]
 *     summary: Broadcast a notification to all users
 *     description: Admin only. Inserts the same notification for every user profile.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title, message]
 *             properties:
 *               type:    { type: string }
 *               title:   { type: string }
 *               message: { type: string }
 *               link:    { type: string }
 *     responses:
 *       201: { description: Broadcast sent to all users }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/broadcast',      authenticate, requireRole('admin'), notificationsController.broadcast);
/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification id
 *     responses:
 *       200: { description: Marked read }
 *       401: { description: Missing/invalid token }
 */
router.patch('/:id/read',      authenticate, notificationsController.markRead);
/**
 * @openapi
 * /notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification id
 *     responses:
 *       204: { description: Notification deleted }
 *       401: { description: Missing/invalid token }
 */
router.delete('/:id',          authenticate, notificationsController.remove);

export default router;
