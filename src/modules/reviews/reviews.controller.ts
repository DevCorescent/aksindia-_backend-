import type { Request, Response } from 'express';
import { reviewsService } from './reviews.service';
import { ok, badRequest, forbidden, notFound, serverError } from '../../utils/response';

export const reviewsController = {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, productId, rating, reviewText } = req.body as {
        orderId: string; productId: string;
        rating: number; reviewText?: string;
      };
      if (!orderId || !productId || !rating) { badRequest(res, 'orderId, productId and rating are required'); return; }
      if (rating < 1 || rating > 5)          { badRequest(res, 'Rating must be between 1 and 5'); return; }

      const customerId = req.user!.id;
      const check = await reviewsService.checkReviewable(orderId, productId, customerId);
      if (!check.ok) {
        if (check.status === 403)      forbidden(res, check.error);
        else if (check.status === 404) notFound(res, check.error);
        else                           badRequest(res, check.error);
        return;
      }

      const review = await reviewsService.create({
        orderId, productId,
        storeId: check.storeId,
        customerId,
        rating: Number(rating),
        reviewText: reviewText ?? '',
      });
      ok(res, review);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getMine(req: Request, res: Response): Promise<void> {
    try {
      const reviews = await reviewsService.getByCustomer(req.user!.id);
      ok(res, reviews);
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
