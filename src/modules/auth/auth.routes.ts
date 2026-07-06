import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Authentication, session management, and the current user's profile
 */

/**
 * @openapi
 * /auth/signin:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with email and password
 *     description: Returns the authenticated user together with access and refresh tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Signed in }
 *       400: { description: email and password required }
 *       401: { description: Invalid email or password }
 */
router.post('/signin',                    authController.signIn);

/**
 * @openapi
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account
 *     description: Creates a user with the given role and returns the new user with tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name, role]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               name:     { type: string }
 *               role:     { type: string, enum: [admin, store_owner, service_provider, customer, agent] }
 *               phone:    { type: string }
 *               city:     { type: string }
 *               state:    { type: string }
 *     responses:
 *       201: { description: Account created }
 *       400: { description: Missing/invalid fields or email already registered }
 */
router.post('/signup',                    authController.signUp);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for new tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New access/refresh tokens }
 *       400: { description: refreshToken required }
 *       401: { description: Invalid or expired refresh token }
 */
router.post('/refresh',                   authController.refresh);

/**
 * @openapi
 * /auth/signout:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out
 *     description: Revokes the supplied refresh token if present. Always succeeds.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Signed out }
 */
router.post('/signout',                   authController.signOut);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     responses:
 *       200: { description: The current user }
 *       401: { description: Missing/invalid token }
 */
router.get('/me',                         authenticate, authController.me);

/**
 * @openapi
 * /auth/me:
 *   patch:
 *     tags: [Auth]
 *     summary: Update the current user's profile
 *     description: Applies the supplied profile fields and returns the updated profile.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:  { type: string }
 *               phone: { type: string }
 *               city:  { type: string }
 *               state: { type: string }
 *     responses:
 *       200: { description: Updated profile }
 *       401: { description: Missing/invalid token }
 */
router.patch('/me',                       authenticate, authController.updateMe);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the current user's password
 *     description: Verifies the current password and updates it. Other sessions must sign in again.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string }
 *     responses:
 *       200: { description: Password changed }
 *       400: { description: Missing fields or current password incorrect }
 *       401: { description: Missing/invalid token }
 */
router.post('/change-password',           authenticate, authController.changePassword);

/**
 * @openapi
 * /auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: List the current user's active sessions
 *     responses:
 *       200: { description: Array of sessions }
 *       401: { description: Missing/invalid token }
 */
router.get('/sessions',                   authenticate, authController.sessions);

/**
 * @openapi
 * /auth/sessions/{sessionId}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke one of the current user's sessions
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Session revoked }
 *       401: { description: Missing/invalid token }
 */
router.delete('/sessions/:sessionId',     authenticate, authController.revokeSession);

export default router;
