import { Router } from 'express';
import { storesController } from './stores.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Stores
 *     description: Storefronts with public browsing, owner management, and admin approval
 */

/**
 * @openapi
 * /stores/public:
 *   get:
 *     tags: [Stores]
 *     summary: List stores (public)
 *     parameters:
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of stores }
 */
router.get('/public',          storesController.listPublic);

/**
 * @openapi
 * /stores/public/slug/{slug}:
 *   get:
 *     tags: [Stores]
 *     summary: Get a store by slug (public)
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The store }
 *       500: { description: Store not found }
 */
router.get('/public/slug/:slug', storesController.getBySlug);

/**
 * @openapi
 * /stores/public/{id}:
 *   get:
 *     tags: [Stores]
 *     summary: Get a store by id (public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The store }
 *       500: { description: Store not found }
 */
router.get('/public/:id',      storesController.getById);

/**
 * @openapi
 * /stores/public/{id}/products:
 *   get:
 *     tags: [Stores]
 *     summary: List a store's products (public)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of the store's products }
 */
router.get('/public/:id/products', storesController.getProducts);

/**
 * @openapi
 * /stores:
 *   get:
 *     tags: [Stores]
 *     summary: List stores (authenticated)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filter by store status.
 *     responses:
 *       200: { description: Array of stores }
 *       401: { description: Missing/invalid token }
 */
router.get('/',            authenticate, storesController.list);

/**
 * @openapi
 * /stores/slug/{slug}:
 *   get:
 *     tags: [Stores]
 *     summary: Get a store by slug (authenticated)
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The store }
 *       401: { description: Missing/invalid token }
 *       500: { description: Store not found }
 */
router.get('/slug/:slug',  authenticate, storesController.getBySlug);

/**
 * @openapi
 * /stores/{id}:
 *   get:
 *     tags: [Stores]
 *     summary: Get a store by id (authenticated)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The store }
 *       401: { description: Missing/invalid token }
 *       500: { description: Store not found }
 */
router.get('/:id',         authenticate, storesController.getById);

/**
 * @openapi
 * /stores/{id}/products:
 *   get:
 *     tags: [Stores]
 *     summary: List a store's products (authenticated)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of the store's products }
 *       401: { description: Missing/invalid token }
 */
router.get('/:id/products',authenticate, storesController.getProducts);

/**
 * @openapi
 * /stores:
 *   post:
 *     tags: [Stores]
 *     summary: Create a store
 *     description: Requires admin or store_owner. ownerId/ownerName default to the caller when omitted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name:           { type: string }
 *               slug:           { type: string }
 *               tagline:        { type: string }
 *               description:    { type: string }
 *               logo:           { type: string }
 *               themeColor:     { type: string }
 *               city:           { type: string }
 *               state:          { type: string }
 *               storeType:      { type: string }
 *               status:         { type: string }
 *               commissionRate: { type: number }
 *               subdomain:      { type: string }
 *               contactEmail:   { type: string }
 *               contactPhone:   { type: string }
 *               gstNumber:      { type: string }
 *               invoiceSettings: { type: object }
 *               ownerId:        { type: string }
 *               ownerName:      { type: string }
 *     responses:
 *       201: { description: Store created }
 *       400: { description: name and slug required }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or store_owner }
 */
router.post('/',           authenticate, requireRole('admin', 'store_owner'), storesController.create);

/**
 * @openapi
 * /stores/{id}:
 *   patch:
 *     tags: [Stores]
 *     summary: Update a store
 *     description: Requires admin or store_owner. Only supplied fields are updated.
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
 *               name:           { type: string }
 *               tagline:        { type: string }
 *               description:    { type: string }
 *               logo:           { type: string }
 *               themeColor:     { type: string }
 *               city:           { type: string }
 *               state:          { type: string }
 *               status:         { type: string }
 *               commissionRate: { type: number }
 *               walletBalance:  { type: number }
 *               totalSales:     { type: number }
 *               totalOrders:    { type: integer }
 *               contactEmail:   { type: string }
 *               contactPhone:   { type: string }
 *               gstNumber:      { type: string }
 *               bankAccount:    { type: string }
 *               bankIfsc:       { type: string }
 *     responses:
 *       200: { description: Updated store }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or store_owner }
 *       500: { description: Store not found }
 */
router.patch('/:id',       authenticate, requireRole('admin', 'store_owner'), storesController.update);

/**
 * @openapi
 * /stores/{id}/activate:
 *   post:
 *     tags: [Stores]
 *     summary: Activate a store (admin)
 *     description: Admin only. Approves and activates the store.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Activated store }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/:id/activate', authenticate, requireRole('admin'), storesController.activate);

/**
 * @openapi
 * /stores/{id}/reject:
 *   post:
 *     tags: [Stores]
 *     summary: Reject a store (admin)
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
 *       200: { description: Rejected store }
 *       400: { description: reason is required }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 */
router.post('/:id/reject',   authenticate, requireRole('admin'), storesController.reject);

export default router;
