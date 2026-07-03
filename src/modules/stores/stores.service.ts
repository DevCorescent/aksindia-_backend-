import { query, queryOne, execute } from '../../config/db';
import type { Store } from '../../types';
import { mapStore } from '../../utils/mappers';

export const storesService = {
  async list(): Promise<Store[]> {
    const rows = await query('SELECT * FROM stores ORDER BY created_at DESC');
    return rows.map(mapStore);
  },

  async getById(id: string): Promise<Store> {
    const row = await queryOne('SELECT * FROM stores WHERE id = $1', [id]);
    if (!row) throw new Error('Store not found');
    return mapStore(row);
  },

  async getBySlug(slug: string): Promise<Store> {
    const row = await queryOne('SELECT * FROM stores WHERE slug = $1', [slug]);
    if (!row) throw new Error('Store not found');
    return mapStore(row);
  },

  async create(payload: Omit<Store, 'id' | 'createdAt' | 'totalSales' | 'totalOrders' | 'walletBalance'>): Promise<Store> {
    const row = await queryOne(
      `INSERT INTO stores
        (owner_id, owner_name, name, slug, tagline, description, logo, theme_color, city, state,
         store_type, status, commission_rate, subdomain, contact_email, contact_phone,
         gst_number, invoice_settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        payload.ownerId, payload.ownerName, payload.name, payload.slug, payload.tagline,
        payload.description ?? '', payload.logo, payload.themeColor, payload.city, payload.state,
        payload.storeType, payload.status, payload.commissionRate, payload.subdomain,
        payload.contactEmail ?? null, payload.contactPhone ?? null, payload.gstNumber ?? null,
        JSON.stringify(payload.invoiceSettings ?? {}),
      ],
    );
    if (!row) throw new Error('Create failed');
    const storeId = (row as Record<string, unknown>).id as string;
    await execute('UPDATE profiles SET store_id = $1 WHERE id = $2', [storeId, payload.ownerId]);
    return mapStore(row);
  },

  async update(id: string, patch: Partial<Store>): Promise<Store> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (patch.name            !== undefined) { fields.push(`name = $${i++}`);             values.push(patch.name); }
    if (patch.tagline         !== undefined) { fields.push(`tagline = $${i++}`);          values.push(patch.tagline); }
    if (patch.description     !== undefined) { fields.push(`description = $${i++}`);      values.push(patch.description); }
    if (patch.logo            !== undefined) { fields.push(`logo = $${i++}`);             values.push(patch.logo); }
    if (patch.themeColor      !== undefined) { fields.push(`theme_color = $${i++}`);      values.push(patch.themeColor); }
    if (patch.city            !== undefined) { fields.push(`city = $${i++}`);             values.push(patch.city); }
    if (patch.state           !== undefined) { fields.push(`state = $${i++}`);            values.push(patch.state); }
    if (patch.status          !== undefined) { fields.push(`status = $${i++}`);           values.push(patch.status); }
    if (patch.commissionRate  !== undefined) { fields.push(`commission_rate = $${i++}`);  values.push(patch.commissionRate); }
    if (patch.walletBalance   !== undefined) { fields.push(`wallet_balance = $${i++}`);   values.push(patch.walletBalance); }
    if (patch.totalSales      !== undefined) { fields.push(`total_sales = $${i++}`);      values.push(patch.totalSales); }
    if (patch.totalOrders     !== undefined) { fields.push(`total_orders = $${i++}`);     values.push(patch.totalOrders); }
    if (patch.contactEmail    !== undefined) { fields.push(`contact_email = $${i++}`);    values.push(patch.contactEmail); }
    if (patch.contactPhone    !== undefined) { fields.push(`contact_phone = $${i++}`);    values.push(patch.contactPhone); }
    if (patch.gstNumber       !== undefined) { fields.push(`gst_number = $${i++}`);       values.push(patch.gstNumber); }
    if (patch.bankAccount     !== undefined) { fields.push(`bank_account = $${i++}`);     values.push(patch.bankAccount); }
    if (patch.bankIfsc        !== undefined) { fields.push(`bank_ifsc = $${i++}`);        values.push(patch.bankIfsc); }
    if (patch.activatedAt     !== undefined) { fields.push(`activated_at = $${i++}`);     values.push(patch.activatedAt); }
    if (patch.activatedBy     !== undefined) { fields.push(`activated_by = $${i++}`);     values.push(patch.activatedBy); }
    if (patch.rejectedAt      !== undefined) { fields.push(`rejected_at = $${i++}`);      values.push(patch.rejectedAt); }
    if (patch.rejectionReason !== undefined) { fields.push(`rejection_reason = $${i++}`); values.push(patch.rejectionReason); }
    if (patch.invoiceSettings !== undefined) { fields.push(`invoice_settings = $${i++}`); values.push(JSON.stringify(patch.invoiceSettings)); }
    if (patch.customization   !== undefined) { fields.push(`customization = $${i++}`);    values.push(JSON.stringify(patch.customization)); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    const row = await queryOne(
      `UPDATE stores SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!row) throw new Error('Store not found');
    return mapStore(row);
  },
};
