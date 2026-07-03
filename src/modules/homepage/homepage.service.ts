import { queryOne } from '../../config/db';
import type { HomepageConfig } from '../../types';
import { mapHomepageConfig } from '../../utils/mappers';

export const homepageService = {
  async get(): Promise<HomepageConfig | null> {
    const row = await queryOne('SELECT * FROM homepage_config WHERE id = 1');
    return row ? mapHomepageConfig(row) : null;
  },

  async update(patch: Partial<HomepageConfig>): Promise<HomepageConfig> {
    const fields: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let i = 1;
    if (patch.announcementBar       !== undefined) { fields.push(`announcement_bar = $${i++}`);        values.push(patch.announcementBar); }
    if (patch.announcementBarActive !== undefined) { fields.push(`announcement_bar_active = $${i++}`); values.push(patch.announcementBarActive); }
    if (patch.heroSlides            !== undefined) { fields.push(`hero_slides = $${i++}`);             values.push(JSON.stringify(patch.heroSlides)); }
    if (patch.miniBanners           !== undefined) { fields.push(`mini_banners = $${i++}`);            values.push(JSON.stringify(patch.miniBanners)); }
    if (patch.showProducts          !== undefined) { fields.push(`show_products = $${i++}`);           values.push(patch.showProducts); }
    if (patch.showServices          !== undefined) { fields.push(`show_services = $${i++}`);           values.push(patch.showServices); }
    if (patch.showStores            !== undefined) { fields.push(`show_stores = $${i++}`);             values.push(patch.showStores); }
    if (patch.showTrustBadges       !== undefined) { fields.push(`show_trust_badges = $${i++}`);       values.push(patch.showTrustBadges); }
    if (patch.showSellerCta         !== undefined) { fields.push(`show_seller_cta = $${i++}`);         values.push(patch.showSellerCta); }
    if (patch.showBrandLogos        !== undefined) { fields.push(`show_brand_logos = $${i++}`);        values.push(patch.showBrandLogos); }
    if (patch.brandLogos            !== undefined) { fields.push(`brand_logos = $${i++}`);             values.push(JSON.stringify(patch.brandLogos)); }
    if (patch.showNewsletter        !== undefined) { fields.push(`show_newsletter = $${i++}`);         values.push(patch.showNewsletter); }
    if (patch.newsletterTitle       !== undefined) { fields.push(`newsletter_title = $${i++}`);        values.push(patch.newsletterTitle); }
    if (patch.newsletterSubtitle    !== undefined) { fields.push(`newsletter_subtitle = $${i++}`);     values.push(patch.newsletterSubtitle); }
    if (patch.showTrendingSection   !== undefined) { fields.push(`show_trending_section = $${i++}`);   values.push(patch.showTrendingSection); }
    if (patch.showBestDeals         !== undefined) { fields.push(`show_best_deals = $${i++}`);         values.push(patch.showBestDeals); }
    if (patch.showCollectionList    !== undefined) { fields.push(`show_collection_list = $${i++}`);    values.push(patch.showCollectionList); }
    const row = await queryOne(
      `UPDATE homepage_config SET ${fields.join(', ')} WHERE id = 1 RETURNING *`,
      values,
    );
    if (!row) throw new Error('Homepage config not found');
    return mapHomepageConfig(row);
  },
};
