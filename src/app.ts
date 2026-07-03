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

const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json());

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

app.use(errorHandler);

export default app;
