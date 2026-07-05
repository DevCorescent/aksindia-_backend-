import type { Request, Response } from 'express';
import { paymentsService, verifyRazorpaySignature } from './payments.service';
import { ok, badRequest, serverError } from '../../utils/response';

export const paymentsController = {
  async webhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = req.body as Buffer;

      if (signature && !verifyRazorpaySignature(rawBody, signature)) {
        badRequest(res, 'Invalid webhook signature');
        return;
      }

      const event = JSON.parse(rawBody.toString());
      const result = await paymentsService.handleWebhook(event);
      ok(res, result);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },

  async getOrderIntent(req: Request, res: Response): Promise<void> {
    try {
      const intent = await paymentsService.createOrderIntent(req.params.orderId);
      ok(res, intent);
    } catch (e) {
      serverError(res, (e as Error).message);
    }
  },
};
