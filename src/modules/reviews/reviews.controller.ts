import type { Request, Response } from 'express';
import { reviewsService } from './reviews.service';
import { ok, badRequest, serverError } from '../../utils/response';

export const reviewsController = {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, productId, storeId, rating, reviewText } = req.body as {
        orderId: string; productId: string; storeId?: string;
        rating: number; reviewText?: string;
      };
      if (!orderId || !productId || !rating) { badRequest(res, 'orderId, productId and rating are required'); return; }
      if (rating < 1 || rating > 5)          { badRequest(res, 'Rating must be between 1 and 5'); return; }

      const review = await reviewsService.create({
        orderId, productId, storeId,
        customerId: req.user!.id,
        rating: Number(rating),
        reviewText: reviewText ?? '',
      });
      ok(res, review);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getByProduct(req: Request, res: Response): Promise<void> {
    try {
      const reviews = await reviewsService.getByProduct(req.params.productId);
      const stats   = await reviewsService.productStats(req.params.productId);
      ok(res, { reviews, ...stats });
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getByStore(req: Request, res: Response): Promise<void> {
    try {
      const reviews = await reviewsService.getByStore(req.params.storeId);
      ok(res, reviews);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getByOrder(req: Request, res: Response): Promise<void> {
    try {
      const reviews = await reviewsService.getByOrder(req.params.orderId);
      ok(res, reviews);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },
};
