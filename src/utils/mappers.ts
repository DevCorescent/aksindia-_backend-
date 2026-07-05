import type { User, Product, Service, Store, Order, ServiceOrder, Agent, WithdrawalRequest, Notification, UserActivity, AbandonedCart, HomepageConfig } from '../types';

// pg returns Date objects for TIMESTAMPTZ; Supabase returned ISO strings. Handle both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDateStr(val: any): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toISOStr(val: any): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProfile(row: any): User {
  return {
    id:        row.id,
    name:      row.name,
    email:     row.email,
    role:      row.role,
    phone:     row.phone   ?? undefined,
    city:      row.city    ?? undefined,
    state:     row.state   ?? undefined,
    avatar:    row.avatar_url ?? undefined,
    storeId:   row.store_id  ?? undefined,
    createdAt: toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapProduct(row: any): Product {
  return {
    id:              row.id,
    storeId:         row.store_id     ?? undefined,
    name:            row.name,
    description:     row.description,
    price:           Number(row.price),
    mrp:             Number(row.mrp),
    commission:      Number(row.commission),
    categoryId:      row.category_id,
    category:        row.category,
    brand:           row.brand        ?? undefined,
    stock:           row.stock,
    sold:            row.sold,
    imageColor:      row.image_color,
    imageIcon:       row.image_icon,
    thumbnail:       row.thumbnail    ?? undefined,
    images:          row.images       ?? [],
    status:          row.status,
    featured:        row.featured,
    availableCities: row.available_cities ?? [],
    tags:            row.tags         ?? [],
    highlights:      row.highlights   ?? [],
    specifications:  row.specifications ?? [],
    warranty:        row.warranty     ?? undefined,
    returnPolicy:    row.return_policy ?? undefined,
    createdAt:       toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapService(row: any): Service {
  return {
    id:              row.id,
    providerId:      row.provider_id,
    providerName:    row.provider_name,
    title:           row.title,
    description:     row.description,
    category:        row.category,
    subcategory:     row.subcategory  ?? undefined,
    price:           Number(row.price),
    priceType:       row.price_type,
    commission:      Number(row.commission),
    deliveryTime:    row.delivery_time,
    imageColor:      row.image_color,
    imageIcon:       row.image_icon,
    thumbnail:       row.thumbnail    ?? undefined,
    images:          row.images       ?? [],
    status:          row.status,
    featured:        row.featured,
    availableCities: row.available_cities ?? [],
    tags:            row.tags         ?? [],
    includes:        row.includes     ?? [],
    process:         row.process      ?? [],
    rating:          Number(row.rating),
    reviewCount:     row.review_count,
    createdAt:       toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapStore(row: any): Store {
  return {
    id:              row.id,
    ownerId:         row.owner_id,
    ownerName:       row.owner_name,
    name:            row.name,
    slug:            row.slug,
    tagline:         row.tagline,
    description:     row.description  ?? undefined,
    logo:            row.logo,
    themeColor:      row.theme_color,
    city:            row.city,
    state:           row.state,
    storeType:       row.store_type,
    status:          row.status,
    commissionRate:  Number(row.commission_rate),
    walletBalance:   Number(row.wallet_balance),
    totalSales:      Number(row.total_sales),
    totalOrders:     row.total_orders,
    subdomain:       row.subdomain,
    contactEmail:    row.contact_email   ?? undefined,
    contactPhone:    row.contact_phone   ?? undefined,
    gstNumber:       row.gst_number      ?? undefined,
    bankAccount:     row.bank_account    ?? undefined,
    bankIfsc:        row.bank_ifsc       ?? undefined,
    customization:   row.customization   ?? {},
    invoiceSettings: row.invoice_settings ?? {},
    activatedAt:     row.activated_at    ?? undefined,
    activatedBy:     row.activated_by    ?? undefined,
    rejectedAt:      row.rejected_at     ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt:       toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOrder(row: any): Order {
  return {
    id:              row.id,
    customerId:      row.customer_id    ?? '',
    customerName:    row.customer_name,
    customerEmail:   row.customer_email,
    storeId:         row.store_id       ?? '',
    storeName:       row.store_name,
    items:           row.items          ?? [],
    subtotal:        Number(row.subtotal),
    shippingCharge:  Number(row.shipping_charge ?? 0),
    discount:        Number(row.discount ?? 0),
    gstAmount:       Number(row.gst_amount ?? 0),
    total:           Number(row.total),
    commissionTotal: Number(row.commission_total),
    adminRevenue:    Number(row.admin_revenue),
    status:          row.status,
    paymentMethod:   row.payment_method ?? 'cod',
    paymentStatus:   row.payment_status,
    address:         row.address,
    city:            row.city,
    agentId:         row.agent_id         ?? undefined,
    agentName:       row.agent_name       ?? undefined,
    agentCode:       row.agent_code       ?? undefined,
    agentCommission: row.agent_commission != null ? Number(row.agent_commission) : undefined,
    trackingNumber:  row.tracking_number  ?? undefined,
    courierName:     row.courier_name     ?? undefined,
    cancelReason:    row.cancel_reason    ?? undefined,
    createdAt:       toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapServiceOrder(row: any): ServiceOrder {
  return {
    id:              row.id,
    serviceId:       row.service_id    ?? '',
    serviceTitle:    row.service_title,
    serviceIcon:     row.service_icon,
    serviceColor:    row.service_color,
    providerId:      row.provider_id   ?? '',
    providerName:    row.provider_name,
    customerId:      row.customer_id   ?? '',
    customerName:    row.customer_name,
    customerEmail:   row.customer_email,
    customerPhone:   row.customer_phone ?? undefined,
    amount:          Number(row.amount),
    status:          row.status,
    scheduledDate:   row.scheduled_date,
    address:         row.address,
    city:            row.city,
    notes:           row.notes          ?? undefined,
    agentId:         row.agent_id       ?? undefined,
    agentName:       row.agent_name     ?? undefined,
    agentCode:       row.agent_code     ?? undefined,
    agentCommission: row.agent_commission != null ? Number(row.agent_commission) : undefined,
    createdAt:       toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAgent(row: any): Agent {
  const p = row.profiles ?? {};
  return {
    id:             row.id,
    name:           p.name   ?? '',
    email:          p.email  ?? '',
    phone:          p.phone  ?? undefined,
    city:           p.city   ?? '',
    state:          p.state  ?? '',
    agentCode:      row.agent_code,
    commissionRate: Number(row.commission_rate),
    status:         row.status,
    walletBalance:  Number(row.wallet_balance),
    totalEarned:    Number(row.total_earned),
    totalOrders:    row.total_orders,
    totalSales:     Number(row.total_sales),
    activatedAt:    row.activated_at ?? undefined,
    activatedBy:    row.activated_by ?? undefined,
    createdAt:      toDateStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapWithdrawal(row: any): WithdrawalRequest {
  return {
    id:           row.id,
    entityType:   row.entity_type,
    entityId:     row.entity_id,
    entityName:   row.entity_name,
    ownerName:    row.owner_name,
    amount:       Number(row.amount),
    bankAccount:  row.bank_account,
    ifsc:         row.ifsc,
    status:       row.status,
    requestedAt:  toISOStr(row.requested_at),
    processedAt:  row.processed_at ? toISOStr(row.processed_at) : undefined,
    note:         row.note ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNotification(row: any): Notification {
  return {
    id:        row.id,
    userId:    row.user_id   ?? undefined,
    type:      row.type,
    title:     row.title,
    message:   row.message,
    read:      row.read,
    link:      row.link      ?? undefined,
    createdAt: toISOStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapUserActivity(row: any): UserActivity {
  return {
    id:        row.id,
    userId:    row.user_id    ?? '',
    userName:  row.user_name,
    userEmail: row.user_email,
    userRole:  row.user_role,
    event:     row.event,
    page:      row.page       ?? undefined,
    metadata:  row.metadata   ?? {},
    sessionId: row.session_id ?? '',
    createdAt: toISOStr(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAbandonedCart(row: any): AbandonedCart {
  return {
    id:           row.id,
    userId:       row.user_id  ?? '',
    userName:     row.user_name,
    userEmail:    row.user_email,
    cartItems:    row.cart_items ?? [],
    total:        Number(row.total),
    itemCount:    row.item_count,
    lastActivity: row.last_activity,
    recovered:    row.recovered,
    recoveredAt:  row.recovered_at ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapHomepageConfig(row: any): HomepageConfig {
  return {
    announcementBar:       row.announcement_bar,
    announcementBarActive: row.announcement_bar_active,
    heroSlides:            row.hero_slides            ?? [],
    miniBanners:           row.mini_banners           ?? [],
    showProducts:          row.show_products,
    showServices:          row.show_services,
    showStores:            row.show_stores,
    showTrustBadges:       row.show_trust_badges,
    showSellerCta:         row.show_seller_cta,
    showBrandLogos:        row.show_brand_logos,
    brandLogos:            row.brand_logos            ?? [],
    showNewsletter:        row.show_newsletter,
    newsletterTitle:       row.newsletter_title,
    newsletterSubtitle:    row.newsletter_subtitle,
    showTrendingSection:   row.show_trending_section,
    showBestDeals:         row.show_best_deals,
    showCollectionList:    row.show_collection_list,
  };
}
