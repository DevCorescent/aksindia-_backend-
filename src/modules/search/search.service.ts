import { query } from '../../config/db';

export const searchService = {
  async global(term: string, city?: string): Promise<{
    products: unknown[];
    services: unknown[];
    stores: unknown[];
  }> {
    const like = `%${term}%`;
    const cityFilter = city ?? null;

    const [products, services, stores] = await Promise.all([
      query(
        `SELECT id, name, category, price, mrp, image_color, image_icon, thumbnail, featured, 'product' AS type
         FROM products
         WHERE status = 'active'
           AND (name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
           AND ($2::text IS NULL OR $2 = ANY(available_cities))
         ORDER BY featured DESC, sold DESC
         LIMIT 20`,
        [like, cityFilter],
      ),
      query(
        `SELECT id, title AS name, category, price, price_type, image_color, image_icon, thumbnail, featured, rating, 'service' AS type
         FROM services
         WHERE status = 'active'
           AND (title ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
           AND ($2::text IS NULL OR $2 = ANY(available_cities))
         ORDER BY featured DESC, rating DESC
         LIMIT 20`,
        [like, cityFilter],
      ),
      query(
        `SELECT id, name, city, logo, theme_color, store_type, total_sales, 'store' AS type
         FROM stores
         WHERE status = 'active'
           AND (name ILIKE $1 OR tagline ILIKE $1)
           AND ($2::text IS NULL OR city = $2)
         ORDER BY total_sales DESC
         LIMIT 10`,
        [like, cityFilter],
      ),
    ]);

    return { products, services, stores };
  },

  async suggestions(term: string, city?: string): Promise<string[]> {
    const like = `${term}%`;
    const cityFilter = city ?? null;
    const [pRows, sRows] = await Promise.all([
      query<{ name: string }>(
        `SELECT DISTINCT name FROM products WHERE status = 'active' AND name ILIKE $1 AND ($2::text IS NULL OR $2 = ANY(available_cities)) LIMIT 8`,
        [like, cityFilter],
      ),
      query<{ name: string }>(
        `SELECT DISTINCT title AS name FROM services WHERE status = 'active' AND title ILIKE $1 AND ($2::text IS NULL OR $2 = ANY(available_cities)) LIMIT 8`,
        [like, cityFilter],
      ),
    ]);
    const seen = new Set<string>();
    const results: string[] = [];
    for (const r of [...pRows, ...sRows]) {
      const n = r.name.toLowerCase();
      if (!seen.has(n)) { seen.add(n); results.push(r.name); }
    }
    return results.slice(0, 10);
  },
};
