import { Router } from 'express';
import { productsController } from './products.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Products
 *     description: Store product catalog with public browsing and owner/admin management
 */

/**
 * @openapi
 * /products/public:
 *   get:
 *     tags: [Products]
 *     summary: List active products (public)
 *     description: Returns active products only. Supports optional filtering via query params.
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
 *         description: When 'true', returns only featured products.
 *       - in: query
 *         name: storeId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of products }
 */
router.get('/public',          productsController.listPublic);

/**
 * @openapi
 * /products/public/featured:
 *   get:
 *     tags: [Products]
 *     summary: List featured active products (public)
 *     parameters:
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *     responses:
 *       200: { description: Array of featured products }
 */
router.get('/public/featured', productsController.featured);

/**
 * @openapi
 * /products/public/search:
 *   get:
 *     tags: [Products]
 *     summary: Search active products by name/description (public)
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
 *       200: { description: Array of matching products }
 *       400: { description: q query param required }
 */
router.get('/public/search',   productsController.search);

/**
 * @openapi
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products (authenticated)
 *     description: Scope depends on role — store owners see their own store's products; customers/agents see active products only.
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema: { type: string }
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
 *       200: { description: Array of products }
 *       401: { description: Missing/invalid token }
 */
router.get('/',      authenticate, productsController.list);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a product by id (authenticated)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The product }
 *       401: { description: Missing/invalid token }
 *       500: { description: Product not found }
 */
router.get('/:id',   authenticate, productsController.getById);

/**
 * @openapi
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a product
 *     description: Requires admin or store_owner. storeId defaults to the caller's store when omitted.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:            { type: string }
 *               description:     { type: string }
 *               price:           { type: number }
 *               mrp:             { type: number }
 *               commission:      { type: number }
 *               categoryId:      { type: string }
 *               category:        { type: string }
 *               brand:           { type: string }
 *               stock:           { type: integer }
 *               storeId:         { type: string }
 *               imageColor:      { type: string }
 *               imageIcon:       { type: string }
 *               thumbnail:       { type: string }
 *               images:          { type: array, items: { type: string } }
 *               status:          { type: string }
 *               featured:        { type: boolean }
 *               availableCities: { type: array, items: { type: string } }
 *               tags:            { type: array, items: { type: string } }
 *               highlights:      { type: array, items: { type: string } }
 *               specifications:  { type: array, items: { type: object } }
 *               warranty:        { type: string }
 *               returnPolicy:    { type: string }
 *     responses:
 *       201: { description: Product created }
 *       400: { description: name is required }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or store_owner }
 */
router.post('/',     authenticate, requireRole('admin', 'store_owner'), productsController.create);

/**
 * @openapi
 * /products/{id}:
 *   patch:
 *     tags: [Products]
 *     summary: Update a product
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
 *               name:            { type: string }
 *               description:     { type: string }
 *               price:           { type: number }
 *               mrp:             { type: number }
 *               commission:      { type: number }
 *               stock:           { type: integer }
 *               status:          { type: string }
 *               featured:        { type: boolean }
 *               imageColor:      { type: string }
 *               imageIcon:       { type: string }
 *               thumbnail:       { type: string }
 *               images:          { type: array, items: { type: string } }
 *               availableCities: { type: array, items: { type: string } }
 *               tags:            { type: array, items: { type: string } }
 *               highlights:      { type: array, items: { type: string } }
 *               specifications:  { type: array, items: { type: object } }
 *               brand:           { type: string }
 *               warranty:        { type: string }
 *               returnPolicy:    { type: string }
 *     responses:
 *       200: { description: Updated product }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or store_owner }
 *       500: { description: Product not found }
 */
router.patch('/:id', authenticate, requireRole('admin', 'store_owner'), productsController.update);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Delete a product
 *     description: Requires admin or store_owner.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Product deleted }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin or store_owner }
 */
router.delete('/:id',authenticate, requireRole('admin', 'store_owner'), productsController.remove);

export default router;
