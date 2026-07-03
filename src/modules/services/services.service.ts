import { query, queryOne, execute } from '../../config/db';
import type { Service, UserRole } from '../../types';
import { mapService } from '../../utils/mappers';

export const servicesService = {
  async list(role: UserRole, providerId?: string): Promise<Service[]> {
    let sql = 'SELECT * FROM services';
    const params: unknown[] = [];
    if (role === 'service_provider' && providerId) {
      sql += ' WHERE provider_id = $1';
      params.push(providerId);
    } else if (role !== 'admin') {
      sql += " WHERE status = 'active'";
    }
    sql += ' ORDER BY created_at DESC';
    const rows = await query(sql, params);
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
         commission, delivery_time, image_color, image_icon, images, status, featured,
         available_cities, tags, includes, process, rating, review_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,0)
       RETURNING *`,
      [
        payload.providerId, payload.providerName, payload.title, payload.description,
        payload.category, payload.subcategory ?? null, payload.price, payload.priceType,
        payload.commission ?? 10, payload.deliveryTime, payload.imageColor, payload.imageIcon,
        payload.images ?? [], payload.status ?? 'pending_review', payload.featured ?? false,
        payload.availableCities ?? [], payload.tags ?? [], payload.includes ?? [],
        JSON.stringify(payload.process ?? []),
      ],
    );
    if (!row) throw new Error('Create failed');
    return mapService(row);
  },

  async update(id: string, patch: Partial<Service>): Promise<Service> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.title           !== undefined) { fields.push(`title = $${i++}`);            values.push(patch.title); }
    if (patch.description     !== undefined) { fields.push(`description = $${i++}`);      values.push(patch.description); }
    if (patch.category        !== undefined) { fields.push(`category = $${i++}`);         values.push(patch.category); }
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
