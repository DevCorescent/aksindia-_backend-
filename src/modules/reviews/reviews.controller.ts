import type { Request, Response } from 'express';
import { reviewsService } from './reviews.service';
import { ok, badRequest, forbidden, notFound, serverError } from '../../utils/response';

const MAX_REVIEW_LENGTH = 2000;

export const reviewsController = {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const { orderId, productId, serviceId, rating, reviewText } = req.body as {
        orderId?: string; productId?: string; serviceId?: string;
        rating?: number; reviewText?: string;
      };
      if (!orderId || (!productId && !serviceId) || rating === undefined) {
        badRequest(res, 'orderId, productId (or serviceId) and rating are required'); return;
      }
      if (productId && serviceId) { badRequest(res, 'Send either productId or serviceId, not both'); return; }
      const stars = Number(rating);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) { badRequest(res, 'Rating must be a whole number between 1 and 5'); return; }
      if (reviewText !== undefined && (typeof reviewText !== 'string' || reviewText.length > MAX_REVIEW_LENGTH)) {
        badRequest(res, `Review text must be at most ${MAX_REVIEW_LENGTH} characters`); return;
      }
      if (req.user!.role !== 'customer') { forbidden(res, 'Only customers can review orders'); return; }

      const customerId = req.user!.id;
      const check = serviceId
        ? await reviewsService.checkServiceReviewable(orderId, serviceId, customerId)
        : await reviewsService.checkReviewable(orderId, productId!, customerId);
      if (!check.ok) {
        if (check.status === 403)      forbidden(res, check.error);
        else if (check.status === 404) notFound(res, check.error);
        else                           badRequest(res, check.error);
        return;
      }

      const review = await reviewsService.create({
        orderId,
        ...(serviceId ? { serviceId } : { productId }),
        storeId: check.storeId,
        customerId,
        rating: stars,
        reviewText: reviewText?.trim() ?? '',
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

  /** Reviews on the signed-in store's / service provider's own items. */
  async getReceived(req: Request, res: Response): Promise<void> {
    try {
      ok(res, await reviewsService.getReceived(req.user!));
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getByOrder(req: Request, res: Response): Promise<void> {
    try {
      if (!(await reviewsService.canViewOrder(req.params.orderId, req.user!))) {
        notFound(res, 'Order not found'); return;
      }
      const reviews = await reviewsService.getByOrder(req.params.orderId);
      ok(res, reviews);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },
};
