import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';

import authRoutes            from './modules/auth/auth.routes';
import productsRoutes        from './modules/products/products.routes';
import servicesRoutes        from './modules/services/services.routes';
import storesRoutes          from './modules/stores/stores.routes';
import ordersRoutes          from './modules/orders/orders.routes';
import serviceOrdersRoutes   from './modules/service-orders/service-orders.routes';
import agentsRoutes          from './modules/agents/agents.routes';
import walletsRoutes         from './modules/wallets/wallets.routes';
import withdrawalsRoutes     from './modules/withdrawals/withdrawals.routes';
import notificationsRoutes   from './modules/notifications/notifications.routes';
import homepageRoutes        from './modules/homepage/homepage.routes';
import analyticsRoutes       from './modules/analytics/analytics.routes';
import adminRoutes           from './modules/admin/admin.routes';
import paymentsRoutes        from './modules/payments/payments.routes';
import searchRoutes          from './modules/search/search.routes';
import uploadRoutes          from './modules/upload/upload.routes';

const app = express();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman) and all origins in dev
    if (!origin || env.nodeEnv !== 'production') { callback(null, true); return; }
    if (env.frontendUrls.includes(origin)) { callback(null, true); return; }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Raw body for webhook signature verification — must come before express.json()
app.use('/api/v1/payments/webhook',          express.raw({ type: 'application/json' }));
app.use('/api/v1/payments/cashfree/webhook', express.raw({ type: 'application/json' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

const v1 = '/api/v1';
app.use(`${v1}/auth`,           authRoutes);
app.use(`${v1}/products`,       productsRoutes);
app.use(`${v1}/services`,       servicesRoutes);
app.use(`${v1}/stores`,         storesRoutes);
app.use(`${v1}/orders`,         ordersRoutes);
app.use(`${v1}/service-orders`, serviceOrdersRoutes);
app.use(`${v1}/agents`,         agentsRoutes);
app.use(`${v1}/wallets`,        walletsRoutes);
app.use(`${v1}/withdrawals`,    withdrawalsRoutes);
app.use(`${v1}/notifications`,  notificationsRoutes);
app.use(`${v1}/homepage`,       homepageRoutes);
app.use(`${v1}/analytics`,      analyticsRoutes);
app.use(`${v1}/admin`,          adminRoutes);
app.use(`${v1}/payments`,       paymentsRoutes);
app.use(`${v1}/search`,         searchRoutes);
app.use(`${v1}/upload`,         uploadRoutes);

app.use(errorHandler);

export default app;
