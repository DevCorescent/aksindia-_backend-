import { Router } from 'express';
import { homepageController } from './homepage.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Homepage
 *     description: Storefront homepage configuration (single global record)
 */

/**
 * @openapi
 * /homepage:
 *   get:
 *     tags: [Homepage]
 *     summary: Get the homepage configuration
 *     description: Public. Returns the single homepage config record, or null if none exists.
 *     responses:
 *       200: { description: Homepage configuration (or null) }
 */
router.get('/',   homepageController.get);
/**
 * @openapi
 * /homepage:
 *   patch:
 *     tags: [Homepage]
 *     summary: Update the homepage configuration
 *     description: Admin only. Applies any supplied fields to the single homepage config record.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               announcementBar:       { type: string }
 *               announcementBarActive: { type: boolean }
 *               heroSlides:            { type: array, items: { type: object } }
 *               miniBanners:           { type: array, items: { type: object } }
 *               showProducts:          { type: boolean }
 *               showServices:          { type: boolean }
 *               showStores:            { type: boolean }
 *               showTrustBadges:       { type: boolean }
 *               showSellerCta:         { type: boolean }
 *               showBrandLogos:        { type: boolean }
 *               brandLogos:            { type: array, items: { type: object } }
 *               showNewsletter:        { type: boolean }
 *               newsletterTitle:       { type: string }
 *               newsletterSubtitle:    { type: string }
 *               showTrendingSection:   { type: boolean }
 *               showBestDeals:         { type: boolean }
 *               showCollectionList:    { type: boolean }
 *     responses:
 *       200: { description: Updated homepage configuration }
 *       401: { description: Missing/invalid token }
 *       403: { description: Not an admin }
 *       500: { description: Homepage config not found }
 */
router.patch('/', authenticate, requireRole('admin'), homepageController.update);

export default router;
