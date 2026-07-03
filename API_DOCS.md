# AskIndia Backend — API Reference

Base URL: `http://localhost:5000/api/v1`  
All responses: `{ success: true, data: ... }` or `{ success: false, error: "..." }`  
Auth: `Authorization: Bearer <accessToken>` header (except public routes)

---

## AUTH  `/api/v1/auth`

### POST `/signin`
Login with email + password. Returns JWT.
```json
// Request
{ "email": "user@example.com", "password": "password123" }

// Response 200
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "",
    "user": {
      "id": "uuid", "name": "Yash", "email": "user@example.com",
      "role": "admin", "phone": "9999999999", "city": "Mumbai",
      "state": "Maharashtra", "storeId": null, "createdAt": "2025-01-01"
    }
  }
}
```

### POST `/signup`
Register a new user.
```json
// Request
{
  "email": "owner@shop.com", "password": "pass123",
  "name": "Store Owner", "role": "store_owner",
  "phone": "9999999999", "city": "Delhi", "state": "Delhi"
}
// roles: "admin" | "store_owner" | "service_provider" | "customer" | "agent"

// Response 201
{ "data": { "userId": "uuid" } }
```

### GET `/me`  🔒
Get logged-in user profile.
```json
// Response 200
{ "data": { "id": "uuid", "name": "...", "role": "...", ... } }
```

### PATCH `/me`  🔒
Update own profile.
```json
// Request (all fields optional)
{ "name": "New Name", "phone": "9999999999", "city": "Mumbai", "state": "MH", "avatar": "url" }

// Response 200
{ "data": { ...updatedUser } }
```

---

## PRODUCTS  `/api/v1/products`  🔒

### GET `/`
List products. Filtered by role automatically:
- `admin` → all products
- `store_owner` → only their store's products
- `customer` / `agent` → only `status: active`

```json
// Response 200
{ "data": [ { "id": "uuid", "name": "Product", "price": 499, "stock": 100, "status": "active", ... } ] }
```

### GET `/:id`
Get single product by ID.

### POST `/`  🔒 `admin | store_owner`
Create a product.
```json
// Request
{
  "name": "Cotton T-Shirt", "description": "Comfortable tee",
  "price": 499, "mrp": 799, "commission": 10,
  "categoryId": "apparel", "category": "Apparel",
  "brand": "H&M", "stock": 50,
  "imageColor": "#4f46e5", "imageIcon": "👕",
  "status": "active", "featured": false,
  "availableCities": ["Mumbai", "Delhi"],
  "tags": ["cotton", "casual"], "highlights": ["100% cotton"],
  "specifications": [{ "key": "Material", "value": "Cotton" }],
  "warranty": "30 days", "returnPolicy": "7 day return",
  "storeId": "uuid"   // optional, auto-filled from logged-in store_owner
}
// Response 201
{ "data": { ...product } }
```

### PATCH `/:id`  🔒 `admin | store_owner`
Update product (partial). Send only changed fields.
```json
{ "price": 449, "stock": 45, "status": "out_of_stock" }
```

### DELETE `/:id`  🔒 `admin | store_owner`
Delete product. Returns `204 No Content`.

---

## SERVICES  `/api/v1/services`  🔒

### GET `/`
Role-filtered:
- `service_provider` → own services only
- `admin` → all services
- others → `status: active` only

### GET `/:id`

### POST `/`  🔒 `admin | service_provider`
```json
{
  "title": "AC Repair", "description": "...", "category": "Home Services",
  "subcategory": "AC", "price": 599, "priceType": "fixed",
  "commission": 10, "deliveryTime": "2-3 hours",
  "imageColor": "#10b981", "imageIcon": "❄️",
  "status": "pending_review", "featured": false,
  "availableCities": ["Mumbai"], "tags": ["AC", "repair"],
  "includes": ["Gas refill", "Cleaning"], "process": [{ "step": "Visit", "desc": "Technician arrives" }]
}
```
`priceType`: `"hourly" | "fixed" | "starting_from"`

### PATCH `/:id`  🔒 `admin | service_provider`
### DELETE `/:id`  🔒 `admin | service_provider`

---

## STORES  `/api/v1/stores`  🔒

### GET `/`
All stores.

### GET `/slug/:slug`
Get store by slug (for public storefront).

### GET `/:id`

### POST `/`  🔒 `admin | store_owner`
```json
{
  "name": "My Shop", "slug": "my-shop", "tagline": "Best products",
  "description": "...", "logo": "🏪", "themeColor": "#0D1F6E",
  "city": "Mumbai", "state": "Maharashtra",
  "storeType": "product", "status": "pending",
  "commissionRate": 10, "subdomain": "myshop",
  "contactEmail": "shop@email.com", "contactPhone": "9999",
  "gstNumber": "27XXXXX"
}
```
`storeType`: `"product" | "service"`

### PATCH `/:id`  🔒 `admin | store_owner`
Updatable fields: `name, tagline, description, logo, themeColor, city, state, status, commissionRate, walletBalance, totalSales, totalOrders, contactEmail, contactPhone, gstNumber, bankAccount, bankIfsc, activatedAt, activatedBy, rejectedAt, rejectionReason, invoiceSettings, customization`

---

## ORDERS  `/api/v1/orders`  🔒

### GET `/`
Role-filtered:
- `customer` → own orders
- `store_owner` → store's orders
- `agent` → orders attributed to them
- `admin` → all orders

### GET `/:id`

### POST `/`  🔒
Place an order.
```json
{
  "customerId": "uuid", "customerName": "John", "customerEmail": "j@mail.com",
  "storeId": "uuid", "storeName": "My Shop",
  "items": [
    { "productId": "uuid", "productName": "T-Shirt", "productIcon": "👕",
      "productColor": "#4f46e5", "quantity": 2, "price": 499, "commission": 10 }
  ],
  "subtotal": 998, "shippingCharge": 50, "discount": 0, "gstAmount": 0, "total": 1048,
  "commissionTotal": 99.8, "adminRevenue": 99.8,
  "status": "pending", "paymentMethod": "upi", "paymentStatus": "pending",
  "address": "123 Main St", "city": "Mumbai",
  "agentId": "uuid", "agentName": "Agent", "agentCode": "AGT001", "agentCommission": 5
}
```
`paymentMethod`: `"card" | "upi" | "wallet" | "cod"`

### PATCH `/:id`  🔒
Update order (store_owner/admin update status):
```json
{ "status": "shipped", "trackingNumber": "TRK123", "courierName": "Delhivery" }
```
`status`: `"pending" | "processing" | "shipped" | "delivered" | "cancelled"`

---

## SERVICE ORDERS  `/api/v1/service-orders`  🔒

### GET `/`
Role-filtered: customer/provider/agent see own, admin sees all.

### GET `/:id`

### POST `/`  🔒
Book a service.
```json
{
  "serviceId": "uuid", "serviceTitle": "AC Repair", "serviceIcon": "❄️", "serviceColor": "#10b981",
  "providerId": "uuid", "providerName": "Provider Co",
  "customerId": "uuid", "customerName": "John", "customerEmail": "j@mail.com",
  "customerPhone": "9999999999", "amount": 599,
  "status": "pending", "scheduledDate": "2025-07-10",
  "address": "123 Main St", "city": "Mumbai", "notes": "Please bring tools",
  "agentId": null, "agentCode": null, "agentCommission": null
}
```

### PATCH `/:id`  🔒
```json
{ "status": "confirmed" }
```
`status`: `"pending" | "confirmed" | "in_progress" | "completed" | "cancelled"`

---

## AGENTS  `/api/v1/agents`  🔒

### GET `/`  `admin only`
List all agents with profile details.

### GET `/code/:code`
Lookup agent by code (e.g. `AGT001`). Used in checkout to attribute commission.

### GET `/:id`

### POST `/`  `admin only`
Register an agent (user must already have a profile):
```json
{ "agentId": "uuid", "agentCode": "AGT001", "commissionRate": 10, "status": "pending" }
```

### PATCH `/:id`  `admin only`
```json
{ "status": "active", "commissionRate": 12 }
```
`status`: `"active" | "pending" | "suspended"`

---

## WALLETS  `/api/v1/wallets`  🔒

### GET `/me`
Get logged-in user's wallet balance + transaction history.
```json
{
  "data": {
    "wallet": { "id": "uuid", "balance": 500.00, "pending": 0, "total_earned": 1200.00, "withdrawn": 700.00 },
    "transactions": [
      { "id": "uuid", "type": "credit", "amount": 100, "description": "Order commission", "created_at": "..." }
    ]
  }
}
```

### POST `/credit`  `admin only`
Manually credit a wallet:
```json
{ "userId": "uuid", "amount": 200, "description": "Bonus payout", "referenceId": "ORD123" }
```

### POST `/ensure`  🔒
Create wallet if not exists (called after signup):
```json
{ "userId": "uuid" }
```

---

## WITHDRAWALS  `/api/v1/withdrawals`  🔒

### GET `/`
- `admin` → all requests
- others → own requests only

### POST `/`
Request a withdrawal:
```json
{
  "entityType": "store", "entityId": "uuid", "entityName": "My Shop",
  "ownerName": "John", "amount": 500,
  "bankAccount": "1234567890", "ifsc": "SBIN0001234",
  "status": "pending"
}
```
`entityType`: `"store" | "service_provider" | "agent"`

### PATCH `/:id`  `admin only`
Process a withdrawal:
```json
{ "status": "processed", "note": "Transferred via NEFT", "processedAt": "2025-07-03T10:00:00Z" }
```
`status`: `"pending" | "approved" | "rejected" | "processed"`

---

## NOTIFICATIONS  `/api/v1/notifications`  🔒

### GET `/me`
Get logged-in user's notifications (latest 100).
```json
{
  "data": [
    { "id": "uuid", "type": "order", "title": "Order Placed", "message": "...", "read": false, "link": "/orders/ORD123", "createdAt": "..." }
  ]
}
```
`type`: `"order" | "commission" | "payout" | "store" | "system" | "service"`

### PATCH `/me/read-all`
Mark all notifications as read.

### POST `/`  `admin only`
Send a notification to a user:
```json
{ "userId": "uuid", "type": "system", "title": "Maintenance", "message": "Scheduled downtime tonight", "link": null }
```

### PATCH `/:id/read`
Mark single notification as read.

### DELETE `/:id`
Delete a notification.

---

## HOMEPAGE  `/api/v1/homepage`

### GET `/`  *(public — no auth)*
Get homepage configuration.
```json
{
  "data": {
    "announcementBar": "🎉 Sale on now!", "announcementBarActive": true,
    "heroSlides": [...], "miniBanners": [...],
    "showProducts": true, "showServices": true, "showStores": true,
    "showTrustBadges": true, "showSellerCta": true,
    "showBrandLogos": false, "brandLogos": [],
    "showNewsletter": true, "newsletterTitle": "Stay in the Loop", "newsletterSubtitle": "...",
    "showTrendingSection": true, "showBestDeals": true, "showCollectionList": true
  }
}
```

### PATCH `/`  🔒 `admin only`
Update any homepage config fields (partial update, all optional):
```json
{
  "announcementBar": "Free delivery above ₹499",
  "announcementBarActive": true,
  "heroSlides": [
    {
      "id": "1", "title": "Big Sale", "subtitle": "Up to 50% off", "ctaText": "Shop Now",
      "ctaLink": "/products", "gradientFrom": "#0D1F6E", "gradientTo": "#1e40af",
      "badge": "Limited", "imageEmoji": "🛍️", "isActive": true
    }
  ],
  "showProducts": true
}
```

---

## ANALYTICS  `/api/v1/analytics`  🔒

### GET `/activities`  `admin only`
User activity log (last 500 events).
```json
{
  "data": [
    { "id": "uuid", "userId": "uuid", "userName": "John", "event": "product_view",
      "page": "/products/uuid", "metadata": { "productId": "uuid" }, "sessionId": "sess_123", "createdAt": "..." }
  ]
}
```

### GET `/abandoned-carts`  `admin only`
Abandoned cart list.

### POST `/track`  🔒
Track a user activity event:
```json
{
  "userId": "uuid", "userName": "John", "userEmail": "j@mail.com", "userRole": "customer",
  "event": "product_view", "page": "/products/uuid",
  "metadata": { "productId": "uuid", "productName": "T-Shirt" },
  "sessionId": "sess_abc123"
}
```
Events: `page_view | product_view | service_view | store_view | add_to_cart | remove_from_cart | update_cart_qty | checkout_start | checkout_complete | search | login | logout | register | service_book | order_placed | profile_update | invoice_download | filter_apply | wishlist_add`

---

## ADMIN  `/api/v1/admin`  🔒 `admin only`

### GET `/users`
All platform users.

### PATCH `/users/:id`
Update a user's profile or role:
```json
{ "role": "store_owner", "is_active": true, "name": "John Doe" }
```

### DELETE `/users/:id`
Permanently delete a user and cascade their data.

### GET `/roles`
List custom roles.

### POST `/roles`
Create a custom role:
```json
{
  "name": "Content Manager", "description": "Manages homepage content",
  "permissions": ["settings.homepage", "products.view"],
  "color": "#8b5cf6"
}
```

### PATCH `/roles/:id`
Update a custom role (partial).

### DELETE `/roles/:id`
Delete a custom role.

### GET `/revenue`
Revenue summary:
```json
{
  "data": {
    "orders": [ { "total": 1048, "admin_revenue": 99.8, "commission_total": 99.8, "created_at": "..." } ],
    "serviceOrders": [ { "amount": 599, "created_at": "..." } ]
  }
}
```

---

## ROLE PERMISSIONS MATRIX

| Endpoint Group | admin | store_owner | service_provider | customer | agent |
|---|---|---|---|---|---|
| auth signin/signup | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET products | ✅ all | ✅ own store | ✅ active only | ✅ active only | ✅ active only |
| POST/PATCH/DELETE products | ✅ | ✅ own | ❌ | ❌ | ❌ |
| GET services | ✅ all | ❌ | ✅ own | ✅ active | ✅ active |
| POST/PATCH/DELETE services | ✅ | ❌ | ✅ own | ❌ | ❌ |
| GET stores | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST/PATCH stores | ✅ | ✅ own | ❌ | ❌ | ❌ |
| GET orders | ✅ all | ✅ own store | ❌ | ✅ own | ✅ own |
| POST orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| PATCH orders | ✅ | ✅ own | ❌ | ❌ | ❌ |
| agents CRUD | ✅ | ❌ | ❌ | ❌ | ❌ |
| wallets credit | ✅ | ❌ | ❌ | ❌ | ❌ |
| withdrawals PATCH | ✅ | ❌ | ❌ | ❌ | ❌ |
| analytics | ✅ | ❌ | ❌ | ❌ | ❌ |
| admin/* | ✅ | ❌ | ❌ | ❌ | ❌ |
| homepage GET | ✅ public | ✅ | ✅ | ✅ | ✅ |
| homepage PATCH | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## ERROR RESPONSES

| Code | Meaning |
|---|---|
| 400 | Bad request — missing required fields |
| 401 | Unauthorized — no token or invalid/expired token |
| 403 | Forbidden — authenticated but wrong role |
| 404 | Resource not found |
| 500 | Server error — check server logs |

---

## SETUP

1. Run `src/db/schema.sql` in Neon SQL Editor once
2. Copy `.env.example` → `.env`, fill in values
3. `npm install && npm run dev`
4. Health check: `GET http://localhost:5000/health`
