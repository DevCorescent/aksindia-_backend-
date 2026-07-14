import { Router } from 'express';
import { reviewsController } from './reviews.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/',                          authenticate, reviewsController.create);
router.get('/mine',                       authenticate, reviewsController.getMine);
router.get('/product/:productId',                       reviewsController.getByProduct);
router.get('/store/:storeId',                           reviewsController.getByStore);
router.get('/order/:orderId',             authenticate, reviewsController.getByOrder);

export default router;
