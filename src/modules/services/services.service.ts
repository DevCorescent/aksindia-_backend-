import { query, queryOne, execute } from '../../config/db';
import type { Service, UserRole } from '../../types';
import { mapService } from '../../utils/mappers';

export const servicesService = {
  async list(role: UserRole, providerId?: string, filters?: { category?: string; city?: string }): Promise<Service[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (role === 'service_provider' && providerId) {
      where.push(`provider_id = $${params.push(providerId)}`);
    } else if (role !== 'admin') {
      where.push(`status = 'active'`);
    }

    if (filters?.category) where.push(`category = $${params.push(filters.category)}`);
    if (filters?.city)     where.push(`$${params.push(filters.city)} = ANY(available_cities)`);

    const sql = `SELECT * FROM services${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY featured DESC, rating DESC, created_at DESC`;
    const rows = await query(sql, params);
    return rows.map(mapService);
  },

  async listPublic(filters?: { category?: string; city?: string; featured?: boolean }): Promise<Service[]> {
    const params: unknown[] = [];
    const where: string[] = [`status = 'active'`];

    if (filters?.category) where.push(`category = $${params.push(filters.category)}`);
    if (filters?.city)     where.push(`$${params.push(filters.city)} = ANY(available_cities)`);
    if (filters?.featured) where.push(`featured = true`);

    const rows = await query(
      `SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY featured DESC, rating DESC, created_at DESC`,
      params,
    );
    return rows.map(mapService);
  },

  async featured(city?: string): Promise<Service[]> {
    const params: unknown[] = [];
    const where = [`status = 'active'`, `featured = true`];
    if (city) where.push(`$${params.push(city)} = ANY(available_cities)`);
    const rows = await query(
      `SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY rating DESC LIMIT 20`,
      params,
    );
    return rows.map(mapService);
  },

  async search(term: string, city?: string): Promise<Service[]> {
    const params: unknown[] = [`%${term}%`, `%${term}%`];
    const where = [`status = 'active'`, `(title ILIKE $1 OR description ILIKE $2)`];
    if (city) where.push(`$${params.push(city)} = ANY(available_cities)`);
    const rows = await query(
      `SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY featured DESC, rating DESC LIMIT 50`,
      params,
    );
    return rows.map(mapService);
  },

  async getById(id: string): Promise<Service> {
    const row = await queryOne('SELECT * FROM services WHERE id = $1', [id]);
    if (!row) throw new Error('Service not found');
    return mapService(row);
  },

  async create(payload: Omit<Service, 'id' | 'createdAt' | 'rating' | 'reviewCount'>): Promise<Service> {
    const row = await queryOne(
      `INSERT INTO services
        (provider_id, provider_name, title, description, category, subcategory, price, price_type,
         commission, delivery_time, image_color, image_icon, thumbnail, images, status, featured,
         available_cities, tags, includes, process, rating, review_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,0,0)
       RETURNING *`,
      [
        payload.providerId, payload.providerName, payload.title, payload.description,
        payload.category, payload.subcategory ?? null, payload.price, payload.priceType,
        payload.commission ?? 10, payload.deliveryTime, payload.imageColor, payload.imageIcon,
        payload.thumbnail ?? null, payload.images ?? [],
        payload.status ?? 'pending_review', payload.featured ?? false,
        payload.availableCities ?? [], payload.tags ?? [], payload.includes ?? [],
        JSON.stringify(payload.process ?? []),
      ],
    );
    if (!row) throw new Error('Create failed');
    return mapService(row);
  },

  async approve(id: string): Promise<Service> {
    const row = await queryOne(
      `UPDATE services SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!row) throw new Error('Service not found');
    const service = mapService(row);
    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'system', 'Service Approved', $2)",
      [service.providerId, `Your service "${service.title}" has been approved and is now live.`],
    );
    return service;
  },

  async reject(id: string, reason: string): Promise<Service> {
    const row = await queryOne(
      `UPDATE services SET status = 'rejected', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    if (!row) throw new Error('Service not found');
    const service = mapService(row);
    await execute(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'system', 'Service Update', $2)",
      [service.providerId, `Your service "${service.title}" was not approved. Reason: ${reason}`],
    );
    return service;
  },

  async update(id: string, patch: Partial<Service>): Promise<Service> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.title           !== undefined) { fields.push(`title = $${i++}`);            values.push(patch.title); }
    if (patch.description     !== undefined) { fields.push(`description = $${i++}`);      values.push(patch.description); }
    if (patch.category        !== undefined) { fields.push(`category = $${i++}`);         values.push(patch.category); }
    if (patch.subcategory     !== undefined) { fields.push(`subcategory = $${i++}`);      values.push(patch.subcategory); }
    if (patch.price           !== undefined) { fields.push(`price = $${i++}`);            values.push(patch.price); }
    if (patch.priceType       !== undefined) { fields.push(`price_type = $${i++}`);       values.push(patch.priceType); }
    if (patch.commission      !== undefined) { fields.push(`commission = $${i++}`);       values.push(patch.commission); }
    if (patch.status          !== undefined) { fields.push(`status = $${i++}`);           values.push(patch.status); }
    if (patch.featured        !== undefined) { fields.push(`featured = $${i++}`);         values.push(patch.featured); }
    if (patch.availableCities !== undefined) { fields.push(`available_cities = $${i++}`); values.push(patch.availableCities); }
    if (patch.tags            !== undefined) { fields.push(`tags = $${i++}`);             values.push(patch.tags); }
    if (patch.includes        !== undefined) { fields.push(`includes = $${i++}`);         values.push(patch.includes); }
    if (patch.process         !== undefined) { fields.push(`process = $${i++}`);          values.push(JSON.stringify(patch.process)); }
    if (patch.deliveryTime    !== undefined) { fields.push(`delivery_time = $${i++}`);    values.push(patch.deliveryTime); }
    if (patch.thumbnail       !== undefined) { fields.push(`thumbnail = $${i++}`);        values.push(patch.thumbnail); }
    if (patch.images          !== undefined) { fields.push(`images = $${i++}`);           values.push(patch.images); }
    if (patch.rating          !== undefined) { fields.push(`rating = $${i++}`);           values.push(patch.rating); }
    if (patch.reviewCount     !== undefined) { fields.push(`review_count = $${i++}`);     values.push(patch.reviewCount); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    const row = await queryOne(
      `UPDATE services SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Service not found');
    return mapService(row);
  },

  async remove(id: string): Promise<void> {
    await execute('DELETE FROM services WHERE id = $1', [id]);
  },
};
