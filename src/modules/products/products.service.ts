import { query, queryOne, execute } from '../../config/db';
import type { Product, UserRole } from '../../types';
import { mapProduct } from '../../utils/mappers';

function buildUpdate(patch: Partial<Product>): { fields: string[]; values: unknown[] } {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.name            !== undefined) { fields.push(`name = $${i++}`);             values.push(patch.name); }
  if (patch.description     !== undefined) { fields.push(`description = $${i++}`);      values.push(patch.description); }
  if (patch.price           !== undefined) { fields.push(`price = $${i++}`);            values.push(patch.price); }
  if (patch.mrp             !== undefined) { fields.push(`mrp = $${i++}`);              values.push(patch.mrp); }
  if (patch.commission      !== undefined) { fields.push(`commission = $${i++}`);       values.push(patch.commission); }
  if (patch.stock           !== undefined) { fields.push(`stock = $${i++}`);            values.push(patch.stock); }
  if (patch.status          !== undefined) { fields.push(`status = $${i++}`);           values.push(patch.status); }
  if (patch.featured        !== undefined) { fields.push(`featured = $${i++}`);         values.push(patch.featured); }
  if (patch.imageColor      !== undefined) { fields.push(`image_color = $${i++}`);      values.push(patch.imageColor); }
  if (patch.imageIcon       !== undefined) { fields.push(`image_icon = $${i++}`);       values.push(patch.imageIcon); }
  if (patch.thumbnail       !== undefined) { fields.push(`thumbnail = $${i++}`);        values.push(patch.thumbnail); }
  if (patch.images          !== undefined) { fields.push(`images = $${i++}`);           values.push(patch.images); }
  if (patch.availableCities !== undefined) { fields.push(`available_cities = $${i++}`); values.push(patch.availableCities); }
  if (patch.tags            !== undefined) { fields.push(`tags = $${i++}`);             values.push(patch.tags); }
  if (patch.highlights      !== undefined) { fields.push(`highlights = $${i++}`);       values.push(patch.highlights); }
  if (patch.specifications  !== undefined) { fields.push(`specifications = $${i++}`);   values.push(JSON.stringify(patch.specifications)); }
  if (patch.brand           !== undefined) { fields.push(`brand = $${i++}`);            values.push(patch.brand); }
  if (patch.warranty        !== undefined) { fields.push(`warranty = $${i++}`);         values.push(patch.warranty); }
  if (patch.returnPolicy    !== undefined) { fields.push(`return_policy = $${i++}`);    values.push(patch.returnPolicy); }
  return { fields, values };
}

export const productsService = {
  async list(role: UserRole, storeId?: string, filters?: { category?: string; city?: string; featured?: boolean }): Promise<Product[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (role === 'store_owner' && storeId) {
      where.push(`store_id = $${params.push(storeId)}`);
    } else if (role === 'customer' || role === 'agent') {
      where.push(`status = 'active'`);
    }

    if (filters?.category) where.push(`category = $${params.push(filters.category)}`);
    if (filters?.city)     where.push(`$${params.push(filters.city)} = ANY(available_cities)`);
    if (filters?.featured) where.push(`featured = true`);

    const sql = `SELECT * FROM products${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const rows = await query(sql, params);
    return rows.map(mapProduct);
  },

  async listPublic(filters?: { category?: string; city?: string; featured?: boolean; storeId?: string }): Promise<Product[]> {
    const params: unknown[] = [];
    const where: string[] = [`status = 'active'`];

    if (filters?.category) where.push(`category = $${params.push(filters.category)}`);
    if (filters?.city)     where.push(`$${params.push(filters.city)} = ANY(available_cities)`);
    if (filters?.featured) where.push(`featured = true`);
    if (filters?.storeId)  where.push(`store_id = $${params.push(filters.storeId)}`);

    const rows = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY featured DESC, created_at DESC`, params);
    return rows.map(mapProduct);
  },

  async featured(city?: string): Promise<Product[]> {
    const params: unknown[] = [];
    const where: string[] = [`status = 'active'`, `featured = true`];
    if (city) where.push(`$${params.push(city)} = ANY(available_cities)`);
    const rows = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 20`, params);
    return rows.map(mapProduct);
  },

  async search(term: string, city?: string): Promise<Product[]> {
    const params: unknown[] = [`%${term}%`, `%${term}%`];
    const where = [`status = 'active'`, `(name ILIKE $1 OR description ILIKE $2)`];
    if (city) where.push(`$${params.push(city)} = ANY(available_cities)`);
    const rows = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY featured DESC, created_at DESC LIMIT 50`, params);
    return rows.map(mapProduct);
  },

  async getById(id: string): Promise<Product> {
    const row = await queryOne('SELECT * FROM products WHERE id = $1', [id]);
    if (!row) throw new Error('Product not found');
    return mapProduct(row);
  },

  async create(payload: Omit<Product, 'id' | 'createdAt' | 'sold'> & { storeId?: string }): Promise<Product> {
    const { storeId, ...rest } = payload;
    const row = await queryOne(
      `INSERT INTO products
        (store_id, name, description, price, mrp, commission, category_id, category, brand,
         stock, image_color, image_icon, thumbnail, images, status, featured, available_cities, tags,
         highlights, specifications, warranty, return_policy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        storeId ?? null, rest.name, rest.description, rest.price, rest.mrp, rest.commission,
        rest.categoryId, rest.category, rest.brand ?? null, rest.stock,
        rest.imageColor, rest.imageIcon, rest.thumbnail ?? null, rest.images ?? [],
        rest.status, rest.featured, rest.availableCities ?? [],
        rest.tags ?? [], rest.highlights ?? [],
        JSON.stringify(rest.specifications ?? []),
        rest.warranty ?? '', rest.returnPolicy ?? '',
      ],
    );
    if (!row) throw new Error('Create failed');
    return mapProduct(row);
  },

  async update(id: string, patch: Partial<Product>): Promise<Product> {
    const { fields, values } = buildUpdate(patch);
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    const row = await queryOne(
      `UPDATE products SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Product not found');
    return mapProduct(row);
  },

  async decrementStock(id: string, qty: number): Promise<void> {
    await execute(
      'UPDATE products SET stock = GREATEST(stock - $1, 0), sold = sold + $1 WHERE id = $2',
      [qty, id],
    );
  },

  async remove(id: string): Promise<void> {
    await execute('DELETE FROM products WHERE id = $1', [id]);
  },
};
