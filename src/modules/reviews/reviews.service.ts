import { query, queryOne, execute } from '../../config/db';

export interface Review {
  id: string;
  orderId: string;
  productId: string;
  customerId: string;
  storeId?: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  customerName?: string;
}

function mapReview(row: Record<string, unknown>): Review {
  return {
    id:           String(row.id),
    orderId:      String(row.order_id),
    productId:    String(row.product_id),
    customerId:   String(row.customer_id),
    storeId:      row.store_id ? String(row.store_id) : undefined,
    rating:       Number(row.rating),
    reviewText:   String(row.review_text ?? ''),
    createdAt:    String(row.created_at),
    customerName: row.customer_name ? String(row.customer_name) : undefined,
  };
}

export type ReviewableCheck =
  | { ok: true; storeId?: string }
  | { ok: false; status: 400 | 403 | 404; error: string };

export const reviewsService = {
  /**
   * A customer may only review a product they actually bought, on an order of
   * their own, once it has been delivered. Returns the order's store so the
   * caller does not have to trust a client-supplied storeId.
   */
  async checkReviewable(orderId: string, productId: string, customerId: string): Promise<ReviewableCheck> {
    const row = await queryOne(
      `SELECT customer_id, store_id, status, items FROM orders WHERE id = $1`,
      [orderId],
    );
    if (!row) return { ok: false, status: 404, error: 'Order not found' };

    const order = row as Record<string, unknown>;
    if (String(order.customer_id) !== customerId) {
      return { ok: false, status: 403, error: 'This order does not belong to you' };
    }
    if (String(order.status) !== 'delivered') {
      return { ok: false, status: 400, error: 'Only delivered orders can be reviewed' };
    }

    const items = (order.items ?? []) as { productId?: string }[];
    if (!items.some(i => String(i.productId) === productId)) {
      return { ok: false, status: 400, error: 'That product is not part of this order' };
    }

    return { ok: true, storeId: order.store_id ? String(order.store_id) : undefined };
  },

  async create(payload: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    const row = await queryOne(
      `INSERT INTO reviews (order_id, product_id, customer_id, store_id, rating, review_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (order_id, product_id) DO UPDATE
         SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text
       RETURNING *`,
      [payload.orderId, payload.productId, payload.customerId, payload.storeId ?? null, payload.rating, payload.reviewText ?? ''],
    );
    if (!row) throw new Error('Failed to save review');
    return mapReview(row as Record<string, unknown>);
  },

  async getByProduct(productId: string): Promise<Review[]> {
    const rows = await query(
      `SELECT r.*, p.name AS customer_name
       FROM reviews r
       LEFT JOIN profiles p ON p.id = r.customer_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [productId],
    );
    return (rows as Record<string, unknown>[]).map(mapReview);
  },

  async getByStore(storeId: string): Promise<Review[]> {
    const rows = await query(
      `SELECT r.*, p.name AS customer_name
       FROM reviews r
       LEFT JOIN profiles p ON p.id = r.customer_id
       WHERE r.store_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [storeId],
    );
    return (rows as Record<string, unknown>[]).map(mapReview);
  },

  async getByOrder(orderId: string): Promise<Review[]> {
    const rows = await query(
      `SELECT * FROM reviews WHERE order_id = $1`,
      [orderId],
    );
    return (rows as Record<string, unknown>[]).map(mapReview);
  },

  async getByCustomer(customerId: string): Promise<Review[]> {
    const rows = await query(
      `SELECT * FROM reviews WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customerId],
    );
    return (rows as Record<string, unknown>[]).map(mapReview);
  },

  async productStats(productId: string): Promise<{ avgRating: number; count: number }> {
    const row = await queryOne(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS count
       FROM reviews WHERE product_id = $1`,
      [productId],
    );
    const r = row as Record<string, unknown>;
    return { avgRating: Number(r?.avg_rating ?? 0), count: Number(r?.count ?? 0) };
  },
};
