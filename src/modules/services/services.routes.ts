import { Router } from 'express';
import { servicesController } from './services.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Services
 *     description: Service listings with public browsing, provider management, and admin approval
 */

/**
 * @openapi
 * /services/public:
 *   get:
 *     tags: [Services]
 *     summary: List services (public)
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: featured
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Array of services }
 */
router.get('/public',          servicesController.listPublic);

/**
 * @openapi
 * /services/public/featured:
 *   get:
 *     tags: [Services]
 *     summary: List featured services (public)
 *     parameters:
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of featured services }
 */
router.get('/public/featured', servicesController.featured);

/**
 * @openapi
 * /services/public/search:
 *   get:
 *     tags: [Services]
 *     summary: Search services by title/description (public)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Search term.
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of matching services }
 *       400: { description: q query param required }
 */
router.get('/public/search',   servicesController.search);

/**
 * @openapi
 * /services/public/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get a service by id (public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The service }
 *       500: { description: Service not found }
 */
router.get('/public/:id',      servicesController.getById);

/**
 * @openapi
 * /services:
 *   get:
 *     tags: [Services]
 *     summary: List services (authenticated)
 *     description: Scope depends on the caller's role and id.
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of services }
 *       401: { description: Missing/invalid token }
 */
router.get('/',      authenticate, servicesController.list);

/**
 * @openapi
 * /services/{id}:
 *   get:
 *     tags: [Services]
 *     summary: Get a service by id (authenticated)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The service }
 *       401: { description: Missing/invalid token }
 *       500: { description: Service not found }
 */
router.get('/:id',   authenticate, servicesController.getById);

/**
 * @openapi
 * /services:
 *   post:
 *     tags: [Services]
 *     summary: Create a service
 *     description: Requires admin or service_provider. providerId/providerName default to the caller when omitted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:           { type: string }
 *               description:     { type: string }
 *               category:        { type: string }
 *               subcategory:     { type: string }
 *               price:           { type: number }
 *               priceType:       { type: string }
 *               commission:      { type: number }
 *               deliveryTime:    { type: string }
 *               providerId:      { type: string }
 *               providerName:    { type: string }
 *               imageColor:      { type: string }
 *               imageIcon:       { type: string }
 *               thumbnail:       { type: string }
 *               images:          { type: array, items: { type: string } }
 *               status:          { type: string }
 *               featured:        { type: boolean }
 *               availableCities: { type: array, items: { type: string } }
 *               tags:            { type: array, items: { type: string } }
 *               includes:        { type: array, items: { type: string } }
 *               process:         { type: array, items: { type: object } }
 *     responses:
 *       201: { description: Service created }
 *       400: { description: title is required }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or service_provider }
 */
router.post('/',     authenticate, requireRole('admin', 'service_provider'), servicesController.create);

/**
 * @openapi
 * /services/{id}:
 *   patch:
 *     tags: [Services]
 *     summary: Update a service
 *     description: Requires admin or service_provider. Only supplied fields are updated.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:           { type: string }
 *               description:     { type: string }
 *               category:        { type: string }
 *               subcategory:     { type: string }
 *               price:           { type: number }
 *               priceType:       { type: string }
 *               commission:      { type: number }
 *               status:          { type: string }
 *               featured:        { type: boolean }
 *               availableCities: { type: array, items: { type: string } }
 *               tags:            { type: array, items: { type: string } }
 *               includes:        { type: array, items: { type: string } }
 *               process:         { type: array, items: { type: object } }
 *               deliveryTime:    { type: string }
 *               thumbnail:       { type: string }
 *               images:          { type: array, items: { type: string } }
 *               rating:          { type: number }
 *               reviewCount:     { type: integer }
 *     responses:
 *       200: { description: Updated service }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or service_provider }
 *       500: { description: Service not found }
 */
router.patch('/:id', authenticate, requireRole('admin', 'service_provider'), servicesController.update);

/**
 * @openapi
 * /services/{id}:
 *   delete:
 *     tags: [Services]
 *     summary: Delete a service
 *     description: Requires admin or service_provider.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Service deleted }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or service_provider }
 */
router.delete('/:id',authenticate, requireRole('admin', 'service_provider'), servicesController.remove);

/**
 * @openapi
 * /services/{id}/approve:
 *   post:
 *     tags: [Services]
 *     summary: Approve a service (admin)
 *     description: Sets the service status to active. Admin only.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Approved service }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/:id/approve', authenticate, requireRole('admin'), servicesController.approve);

/**
 * @openapi
 * /services/{id}/reject:
 *   post:
 *     tags: [Services]
 *     summary: Reject a service (admin)
 *     description: Admin only. Requires a rejection reason.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
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
 *       200: { description: Rejected service }
 *       400: { description: reason is required }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/:id/reject',  authenticate, requireRole('admin'), servicesController.reject);

export default router;
