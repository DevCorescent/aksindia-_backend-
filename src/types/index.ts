export type UserRole = 'admin' | 'store_owner' | 'service_provider' | 'customer' | 'agent' | 'delivery_partner';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  storeId?: string;
  phone?: string;
  city?: string;
  state?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  storeId?: string;
  name: string;
  description: string;
  price: number;
  mrp: number;
  commission: number;
  categoryId: string;
  category: string;
  brand?: string;
  stock: number;
  sold: number;
  imageColor: string;
  imageIcon: string;
  thumbnail?: string;
  images?: string[];
  status: 'active' | 'draft' | 'out_of_stock';
  featured: boolean;
  availableCities: string[];
  tags?: string[];
  highlights?: string[];
  specifications?: Array<{ key: string; value: string }>;
  warranty?: string;
  returnPolicy?: string;
  createdAt: string;
}

export interface Service {
  id: string;
  providerId: string;
  providerName: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  price: number;
  priceType: 'hourly' | 'fixed' | 'starting_from';
  commission: number;
  availableCities: string[];
  imageColor: string;
  imageIcon: string;
  thumbnail?: string;
  images?: string[];
  status: 'active' | 'inactive' | 'pending_review';
  featured: boolean;
  rating: number;
  reviewCount: number;
  deliveryTime: string;
  tags: string[];
  includes?: string[];
  process?: Array<{ step: string; desc: string }>;
  createdAt: string;
}

export interface Store {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  slug: string;
  tagline: string;
  description?: string;
  logo: string;
  themeColor: string;
  city: string;
  state: string;
  storeType: 'product' | 'service';
  status: 'active' | 'pending' | 'suspended';
  commissionRate: number;
  walletBalance: number;
  totalSales: number;
  totalOrders: number;
  subdomain: string;
  contactEmail?: string;
  contactPhone?: string;
  gstNumber?: string;
  bankAccount?: string;
  bankIfsc?: string;
  customization?: Record<string, unknown>;
  invoiceSettings?: Record<string, unknown>;
  activatedAt?: string;
  activatedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  productIcon: string;
  productColor: string;
  quantity: number;
  price: number;
  commission: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  storeId: string;
  storeName: string;
  items: OrderItem[];
  subtotal: number;
  shippingCharge?: number;
  discount?: number;
  gstAmount?: number;
  total: number;
  commissionTotal: number;
  adminRevenue: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  paymentMethod: 'card' | 'upi' | 'wallet' | 'cod';
  paymentStatus: 'paid' | 'pending' | 'refunded';
  address: string;
  city: string;
  agentId?: string;
  agentName?: string;
  agentCode?: string;
  agentCommission?: number;
  trackingNumber?: string;
  courierName?: string;
  cancelReason?: string;
  createdAt: string;
}

export interface ServiceOrder {
  id: string;
  serviceId: string;
  serviceTitle: string;
  serviceIcon: string;
  serviceColor: string;
  providerId: string;
  providerName: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  scheduledDate: string;
  address: string;
  city: string;
  notes?: string;
  agentId?: string;
  agentName?: string;
  agentCode?: string;
  agentCommission?: number;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  city: string;
  state: string;
  agentCode: string;
  commissionRate: number;
  status: 'active' | 'pending' | 'suspended';
  totalSales: number;
  totalOrders: number;
  walletBalance: number;
  totalEarned: number;
  activatedAt?: string;
  activatedBy?: string;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  entityType: 'store' | 'service_provider' | 'agent';
  entityId: string;
  entityName: string;
  ownerName: string;
  amount: number;
  bankAccount: string;
  ifsc: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  requestedAt: string;
  processedAt?: string;
  note?: string;
}

export interface Notification {
  id: string;
  userId?: string;
  type: 'order' | 'commission' | 'payout' | 'store' | 'system' | 'service';
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface UserActivity {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  event: string;
  page?: string;
  metadata?: Record<string, string | number | boolean>;
  sessionId: string;
  createdAt: string;
}

export interface AbandonedCart {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  cartItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  itemCount: number;
  lastActivity: string;
  recovered: boolean;
  recoveredAt?: string;
}

export interface HomepageConfig {
  announcementBar: string;
  announcementBarActive: boolean;
  heroSlides: unknown[];
  miniBanners: unknown[];
  showProducts: boolean;
  showServices: boolean;
  showStores: boolean;
  showTrustBadges: boolean;
  showSellerCta: boolean;
  showBrandLogos: boolean;
  brandLogos: unknown[];
  showNewsletter: boolean;
  newsletterTitle: string;
  newsletterSubtitle: string;
  showTrendingSection: boolean;
  showBestDeals: boolean;
  showCollectionList: boolean;
}
