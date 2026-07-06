import { Router } from 'express';
import multer from 'multer';
import { createHmac, createHash } from 'crypto';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { ok, serverError, badRequest } from '../../utils/response';
import type { Request, Response } from 'express';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * @openapi
 * tags:
 *   - name: Upload
 *     description: Cloudinary image upload signing and direct upload
 */

// Returns a Cloudinary signed upload params so the frontend can upload directly
// without going through our server (avoids bandwidth cost)
/**
 * @openapi
 * /upload/sign:
 *   post:
 *     tags: [Upload]
 *     summary: Get signed Cloudinary upload parameters for direct browser upload
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folder:
 *                 type: string
 *                 description: Cloudinary folder (defaults to "askindia")
 *     responses:
 *       200: { description: "Signed params (cloudName, apiKey, timestamp, signature, folder)" }
 *       400: { description: Cloudinary not configured or invalid CLOUDINARY_URL }
 *       401: { description: Missing/invalid token }
 *       500: { description: Signing error }
 */
router.post('/sign', authenticate, (req: Request, res: Response) => {
  try {
    if (!env.cloudinaryUrl) { badRequest(res, 'Cloudinary not configured'); return; }

    // Parse cloudinary://key:secret@cloud from CLOUDINARY_URL
    const match = env.cloudinaryUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (!match) { badRequest(res, 'Invalid CLOUDINARY_URL format'); return; }
    const [, apiKey, apiSecret, cloudName] = match;

    const timestamp = Math.floor(Date.now() / 1000);
    const folder    = (req.body.folder as string) ?? 'askindia';
    const toSign    = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash('sha1').update(toSign).digest('hex');

    ok(res, { cloudName, apiKey, timestamp, signature, folder });
  } catch (e) { serverError(res, (e as Error).message); }
});

// Optional: direct upload through backend (smaller files only)
/**
 * @openapi
 * /upload/image:
 *   post:
 *     tags: [Upload]
 *     summary: Upload an image through the backend to Cloudinary (max 5MB)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *     responses:
 *       200: { description: Uploaded image URL }
 *       400: { description: "Cloudinary not configured, invalid CLOUDINARY_URL, or no file uploaded" }
 *       401: { description: Missing/invalid token }
 *       500: { description: Upload error }
 */
router.post('/image', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!env.cloudinaryUrl) { badRequest(res, 'Cloudinary not configured'); return; }
    if (!req.file) { badRequest(res, 'No file uploaded'); return; }

    const match = env.cloudinaryUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (!match) { badRequest(res, 'Invalid CLOUDINARY_URL format'); return; }
    const [, apiKey, apiSecret, cloudName] = match;

    const timestamp = Math.floor(Date.now() / 1000);
    const folder    = 'askindia';
    const toSign    = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash('sha1').update(toSign).digest('hex');

    const form = new FormData();
    form.append('file', new Blob([req.file.buffer]), req.file.originalname);
    form.append('api_key',   apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder',    folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body:   form,
    });
    const data = await response.json() as { secure_url?: string; error?: { message: string } };
    if (data.error) throw new Error(data.error.message);

    ok(res, { url: data.secure_url });
  } catch (e) { serverError(res, (e as Error).message); }
});

export default router;
