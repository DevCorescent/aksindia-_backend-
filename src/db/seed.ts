/**
 * AskIndia — Database Seed Script
 * Run: npx ts-node src/db/seed.ts
 *
 * Seeds demo users, store, products, services, orders, and notifications.
 * Safe to re-run — uses ON CONFLICT DO NOTHING / DO UPDATE.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { pool } from '../config/db';

const ROUNDS = 12;

// ── Demo credentials ──────────────────────────────────────────────────────────
const USERS = [
  { email: 'admin@askindia.shop',      password: 'Admin@1234',    name: 'AskIndia Admin',   role: 'admin',            phone: '9000000001', city: 'Bengaluru', state: 'Karnataka' },
  { email: 'rahul@rahulelectronics.com', password: 'Store@1234',  name: 'Rahul Sharma',     role: 'store_owner',      phone: '9000000002', city: 'Mumbai',    state: 'Maharashtra' },
  { email: 'priya@homeclean.in',        password: 'Service@1234', name: 'Priya Singh',      role: 'service_provider', phone: '9000000003', city: 'Mumbai',    state: 'Maharashtra' },
  { email: 'amit.kumar@gmail.com',      password: 'Customer@1234',name: 'Amit Kumar',       role: 'customer',         phone: '9000000004', city: 'Pune',      state: 'Maharashtra' },
  { email: 'vikram.patel@agent.com',    password: 'Agent@1234',   name: 'Vikram Patel',     role: 'agent',            phone: '9000000005', city: 'Ahmedabad', state: 'Gujarat' },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Starting seed...\n');

    // ── 1. Hash passwords & insert profiles ──────────────────────────────────
    console.log('👤 Creating profiles...');
    const ids: Record<string, string> = {};

    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, ROUNDS);
      const id   = randomUUID();
      ids[u.role === 'store_owner' ? 'storeOwner'
        : u.role === 'service_provider' ? 'provider'
        : u.role === 'customer' ? 'customer'
        : u.role === 'agent' ? 'agent'
        : 'admin'] = id;

      await client.query(
        `INSERT INTO profiles (id, name, email, password_hash, role, phone, city, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
               phone = EXCLUDED.phone, city = EXCLUDED.city, state = EXCLUDED.state
         RETURNING id`,
        [id, u.name, u.email, hash, u.role, u.phone, u.city, u.state],
      );
      // Fetch the actual id in case email existed already
      const row = await client.query('SELECT id FROM profiles WHERE email = $1', [u.email]);
      ids[u.role === 'store_owner' ? 'storeOwner'
        : u.role === 'service_provider' ? 'provider'
        : u.role === 'customer' ? 'customer'
        : u.role === 'agent' ? 'agent'
        : 'admin'] = row.rows[0].id;

      console.log(`   ✓ ${u.role.padEnd(18)} ${u.email}  /  ${u.password}`);
    }

    // ── 2. Wallets ────────────────────────────────────────────────────────────
    console.log('\n💰 Creating wallets...');
    for (const uid of Object.values(ids)) {
      await client.query(
        `INSERT INTO wallets (user_id, balance, total_earned)
         VALUES ($1, 0, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [uid],
      );
    }
    // Give store owner and provider some earnings
    await client.query(
      'UPDATE wallets SET balance = 18450, total_earned = 24750 WHERE user_id = $1',
      [ids.storeOwner],
    );
    await client.query(
      'UPDATE wallets SET balance = 7200, total_earned = 9600 WHERE user_id = $1',
      [ids.provider],
    );
    await client.query(
      'UPDATE wallets SET balance = 2250, total_earned = 3150 WHERE user_id = $1',
      [ids.agent],
    );
    console.log('   ✓ Wallets seeded with demo balances');

    // ── 3. Store ──────────────────────────────────────────────────────────────
    console.log('\n🏪 Creating demo store...');
    const storeId = randomUUID();
    await client.query(
      `INSERT INTO stores
         (id, owner_id, owner_name, name, slug, tagline, description, logo, theme_color,
          city, state, store_type, status, commission_rate, wallet_balance, total_sales, total_orders,
          subdomain, contact_email, contact_phone, activated_at, activated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),$21)
       ON CONFLICT (slug) DO UPDATE
         SET owner_id = EXCLUDED.owner_id, status = 'active',
             total_sales = EXCLUDED.total_sales, total_orders = EXCLUDED.total_orders`,
      [
        storeId, ids.storeOwner, 'Rahul Sharma',
        "Rahul's Electronics Hub", 'rahul-electronics',
        'Best electronics at lowest prices',
        'Authorized dealer of top electronics brands. Smartphones, laptops, earbuds, smart home gadgets and more — all with genuine warranty.',
        '🏪', '#1D4ED8',
        'Mumbai', 'Maharashtra', 'product', 'active', 10,
        18450, 184500, 47,
        'rahul-electronics', 'rahul@rahulelectronics.com', '9000000002',
        'admin@askindia.shop',
      ],
    );
    // Link store to owner profile
    await client.query('UPDATE profiles SET store_id = $1 WHERE id = $2', [storeId, ids.storeOwner]);
    console.log(`   ✓ Store created: Rahul's Electronics Hub  (id: ${storeId})`);

    // ── 4. Products ───────────────────────────────────────────────────────────
    console.log('\n📦 Creating products...');
    const products = [
      {
        name: 'Wireless Bluetooth Earbuds Pro',
        description: 'True wireless earbuds with 40-hour battery life, active noise cancellation, and IPX5 water resistance. Compatible with all Bluetooth 5.3 devices.',
        price: 1299, mrp: 2499, commission: 10, category: 'Electronics', brand: 'SoundWave',
        icon: '🎧', color: '#4F46E5', stock: 120, sold: 340,
        cities: ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Ahmedabad'],
        tags: ['earbuds', 'bluetooth', 'wireless', 'anc'],
        highlights: ['40-hour total battery', 'Active Noise Cancellation', 'IPX5 water resistant', 'Bluetooth 5.3'],
        specs: [{ label: 'Battery', value: '40 hrs (buds 8h + case 32h)' }, { label: 'Driver', value: '10mm dynamic' }, { label: 'Warranty', value: '1 Year' }],
        warranty: '1 Year manufacturer warranty', returnPolicy: '7-day easy returns',
        featured: true, status: 'active',
      },
      {
        name: 'Smart LED Desk Lamp',
        description: 'Touch-controlled smart desk lamp with 10 brightness levels, 3 colour temperatures, USB charging port, and memory function. Eye-care technology reduces blue light.',
        price: 1599, mrp: 2499, commission: 10, category: 'Home & Living', brand: 'LumiTech',
        icon: '💡', color: '#F59E0B', stock: 85, sold: 210,
        cities: ['Mumbai', 'Delhi', 'Bengaluru', 'Pune'],
        tags: ['lamp', 'led', 'smart', 'desk'],
        highlights: ['Touch control', '10 brightness levels', 'USB-A charging port', 'Eye-care mode'],
        specs: [{ label: 'Power', value: '12W' }, { label: 'CCT', value: '3000K–6500K' }, { label: 'Lifespan', value: '50,000 hrs' }],
        warranty: '1 Year', returnPolicy: '7-day returns',
        featured: true, status: 'active',
      },
      {
        name: 'Men\'s Running Shoes',
        description: 'Lightweight mesh running shoes with responsive foam cushioning and anti-slip rubber outsole. Available in sizes 6–12.',
        price: 1899, mrp: 3499, commission: 12, category: 'Fashion & Apparel', brand: 'StrideFit',
        icon: '👟', color: '#10B981', stock: 200, sold: 150,
        cities: ['Mumbai', 'Pune', 'Ahmedabad', 'Surat'],
        tags: ['shoes', 'running', 'sports', 'men'],
        highlights: ['Breathable mesh upper', 'Responsive foam sole', 'Anti-slip outsole', 'Available sizes 6–12'],
        specs: [{ label: 'Material', value: 'Mesh + EVA foam' }, { label: 'Weight', value: '280g (UK 8)' }],
        warranty: '6 Months', returnPolicy: '15-day returns',
        featured: false, status: 'active',
      },
      {
        name: 'Yoga Mat Premium 6mm',
        description: 'Non-slip TPE yoga mat with alignment lines, carry strap, and extra thickness for joint protection. Eco-friendly and odour-resistant.',
        price: 899, mrp: 1299, commission: 10, category: 'Sports & Fitness', brand: 'ZenFlex',
        icon: '🧘', color: '#7C3AED', stock: 150, sold: 290,
        cities: ['Mumbai', 'Pune', 'Bengaluru', 'Delhi'],
        tags: ['yoga', 'fitness', 'mat', 'exercise'],
        highlights: ['6mm thick for joint protection', 'Non-slip surface', 'Eco-friendly TPE', 'Includes carry strap'],
        specs: [{ label: 'Thickness', value: '6mm' }, { label: 'Size', value: '183cm × 61cm' }, { label: 'Material', value: 'TPE' }],
        warranty: '6 Months', returnPolicy: '7-day returns',
        featured: false, status: 'active',
      },
      {
        name: 'Organic Face Cream SPF 30',
        description: 'Lightweight daily moisturiser with SPF 30 sun protection, hyaluronic acid for hydration, and vitamin C for brightening. Suitable for all skin types.',
        price: 549, mrp: 799, commission: 15, category: 'Beauty & Care', brand: 'GlowNaturals',
        icon: '🌸', color: '#EC4899', stock: 300, sold: 480,
        cities: ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Chennai'],
        tags: ['skincare', 'sunscreen', 'organic', 'moisturiser'],
        highlights: ['SPF 30 broad spectrum', 'Hyaluronic acid', 'Vitamin C brightening', 'Non-greasy formula'],
        specs: [{ label: 'Volume', value: '50ml' }, { label: 'Skin type', value: 'All types' }, { label: 'Shelf life', value: '24 months' }],
        warranty: 'N/A', returnPolicy: '7-day returns',
        featured: true, status: 'active',
      },
      {
        name: 'Non-stick Cookware Set 5pcs',
        description: '5-piece granite-coated non-stick cookware set: 2 frying pans, 2 sauce pans, 1 kadhai. PFOA-free, induction compatible, dishwasher safe.',
        price: 2499, mrp: 3999, commission: 10, category: 'Home & Living', brand: 'KitchenKing',
        icon: '🍳', color: '#EF4444', stock: 60, sold: 95,
        cities: ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad'],
        tags: ['cookware', 'kitchen', 'non-stick', 'induction'],
        highlights: ['5-piece set', 'PFOA-free granite coating', 'Induction compatible', 'Dishwasher safe'],
        specs: [{ label: 'Set includes', value: '2 fry pans, 2 sauce pans, 1 kadhai' }, { label: 'Material', value: 'Aluminium + granite coat' }],
        warranty: '2 Years', returnPolicy: '10-day returns',
        featured: false, status: 'active',
      },
    ];

    const productIds: string[] = [];
    for (const p of products) {
      const pid = randomUUID();
      productIds.push(pid);
      await client.query(
        `INSERT INTO products
           (id, store_id, name, description, price, mrp, commission, category_id, category,
            brand, stock, sold, image_color, image_icon, status, featured,
            available_cities, tags, highlights, specifications, warranty, return_policy)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO NOTHING`,
        [
          pid, storeId, p.name, p.description, p.price, p.mrp, p.commission,
          p.category.toLowerCase().replace(/ /g, '_'), p.category,
          p.brand, p.stock, p.sold, p.color, p.icon,
          p.status, p.featured, p.cities, p.tags, p.highlights,
          JSON.stringify(p.specs), p.warranty, p.returnPolicy,
        ],
      );
      console.log(`   ✓ ${p.name}`);
    }

    // ── 5. Agent ─────────────────────────────────────────────────────────────
    console.log('\n🤝 Creating agent record...');
    // Remove any stale agent row with code AGT001 that belongs to a different id
    await client.query(
      `DELETE FROM agents WHERE agent_code = 'AGT001' AND id <> $1`,
      [ids.agent],
    );
    await client.query(
      `INSERT INTO agents (id, agent_code, commission_rate, status, wallet_balance, total_earned, total_orders, total_sales, activated_at, activated_by)
       VALUES ($1,'AGT001',5,'active',2250,3150,18,45000,NOW(),'admin@askindia.shop')
       ON CONFLICT (id) DO UPDATE
         SET agent_code = 'AGT001', status = 'active', commission_rate = 5,
             wallet_balance = 2250, total_earned = 3150, activated_at = NOW(),
             activated_by = 'admin@askindia.shop'`,
      [ids.agent],
    );
    console.log('   ✓ Agent: Vikram Patel  (code: AGT001)');

    // ── 6. Services ───────────────────────────────────────────────────────────
    console.log('\n🛠️  Creating services...');
    const services = [
      {
        title: 'AC Repair & Deep Service',
        description: 'Complete AC maintenance including gas refill check, coil cleaning, filter replacement, and thermostat calibration. Same-day service available.',
        category: 'Home Services', price: 499, priceType: 'fixed',
        icon: '❄️', color: '#0EA5E9',
        cities: ['Mumbai', 'Pune', 'Thane', 'Navi Mumbai'],
        tags: ['ac', 'repair', 'maintenance', 'home'],
        includes: ['Gas level check', 'Coil deep cleaning', 'Filter replacement', 'Thermostat calibration', 'Service report'],
        process: [
          { step: 1, title: 'Book Appointment', desc: 'Choose your preferred date and time slot.' },
          { step: 2, title: 'Technician Visit', desc: 'Our certified technician arrives at your location.' },
          { step: 3, title: 'Diagnosis & Service', desc: 'Full inspection and service completed in 60–90 min.' },
          { step: 4, title: 'Payment & Report', desc: 'Pay after service and receive digital service report.' },
        ],
        rating: 4.7, reviewCount: 328, deliveryTime: 'Same day',
        featured: true, status: 'active',
      },
      {
        title: 'Home Deep Cleaning',
        description: 'Professional deep cleaning for 1–4 BHK homes. Kitchen degreasing, bathroom sanitisation, floor scrubbing, and ceiling fan cleaning included.',
        category: 'Home Services', price: 999, priceType: 'starting_from',
        icon: '🧹', color: '#10B981',
        cities: ['Mumbai', 'Pune', 'Bengaluru'],
        tags: ['cleaning', 'home', 'deep clean', 'sanitise'],
        includes: ['Kitchen deep clean', 'Bathroom sanitisation', 'Floor scrubbing', 'Ceiling fan cleaning', 'Eco-friendly products'],
        process: [
          { step: 1, title: 'Book & Select Size', desc: 'Choose your BHK size for accurate pricing.' },
          { step: 2, title: 'Pre-clean Inspection', desc: 'Our team does a quick walkthrough before starting.' },
          { step: 3, title: '3–5 hr Deep Clean', desc: 'Systematic room-by-room deep clean.' },
          { step: 4, title: 'Final Walkthrough', desc: 'You inspect — we rectify anything you\'re not happy with.' },
        ],
        rating: 4.5, reviewCount: 512, deliveryTime: '3–4 hours',
        featured: true, status: 'active',
      },
      {
        title: 'Maths & Science Tutoring',
        description: 'One-on-one tutoring for Class 8–12 students. Covers CBSE, ICSE, and State Board syllabi. Concept-first teaching with past-paper practice.',
        category: 'Education', price: 600, priceType: 'hourly',
        icon: '📚', color: '#8B5CF6',
        cities: ['Mumbai', 'Pune', 'Bengaluru', 'Hyderabad', 'Delhi'],
        tags: ['tuition', 'maths', 'science', 'class 12', 'cbse'],
        includes: ['1-on-1 online/offline sessions', 'Study material provided', 'Past paper practice', 'Weekly progress report'],
        process: [
          { step: 1, title: 'Free Trial Class', desc: '30-min free trial session to assess the student.' },
          { step: 2, title: 'Customised Plan', desc: 'Topic-wise plan based on weak areas.' },
          { step: 3, title: 'Regular Sessions', desc: 'Scheduled sessions at your preferred time.' },
          { step: 4, title: 'Progress Reports', desc: 'Weekly parent reports and monthly mock tests.' },
        ],
        rating: 4.9, reviewCount: 147, deliveryTime: 'Flexible',
        featured: false, status: 'active',
      },
      {
        title: 'Bridal Makeup & Hairstyling',
        description: 'Full bridal package — airbrush makeup, hairstyling, draping, and touch-up kit. Trial session included. Experienced team with 500+ bridal looks.',
        category: 'Beauty & Wellness', price: 4500, priceType: 'starting_from',
        icon: '💄', color: '#EC4899',
        cities: ['Mumbai', 'Pune', 'Nashik'],
        tags: ['bridal', 'makeup', 'wedding', 'hair'],
        includes: ['Airbrush bridal makeup', 'Hairstyling', 'Saree/lehenga draping', 'Touch-up kit', 'Pre-bridal trial session'],
        process: [
          { step: 1, title: 'Consultation & Trial', desc: 'Discuss look, trial session 1 week before.' },
          { step: 2, title: 'Pre-bridal Prep', desc: 'Skin prep and hair conditioning treatment.' },
          { step: 3, title: 'Bridal Day Session', desc: '4–5 hour session at venue or home.' },
          { step: 4, title: 'Touch-up & Draping', desc: 'Touch-up kit handed over for the day.' },
        ],
        rating: 4.8, reviewCount: 94, deliveryTime: '4–5 hours',
        featured: true, status: 'active',
      },
    ];

    const serviceIds: string[] = [];
    for (const s of services) {
      const sid = randomUUID();
      serviceIds.push(sid);
      await client.query(
        `INSERT INTO services
           (id, provider_id, provider_name, title, description, category, price, price_type,
            commission, delivery_time, image_color, image_icon, status, featured,
            available_cities, tags, includes, process, rating, review_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO NOTHING`,
        [
          sid, ids.provider, 'Priya Singh',
          s.title, s.description, s.category, s.price, s.priceType,
          10, s.deliveryTime, s.color, s.icon,
          s.status, s.featured, s.cities, s.tags, s.includes,
          JSON.stringify(s.process), s.rating, s.reviewCount,
        ],
      );
      console.log(`   ✓ ${s.title}`);
    }

    // ── 7. Sample Orders ──────────────────────────────────────────────────────
    console.log('\n📋 Creating sample orders...');
    const orderItems = [
      { productId: productIds[0], productName: 'Wireless Bluetooth Earbuds Pro', productIcon: '🎧', productColor: '#4F46E5', quantity: 1, price: 1299, commission: 130 },
      { productId: productIds[4], productName: 'Organic Face Cream SPF 30',      productIcon: '🌸', productColor: '#EC4899', quantity: 2, price: 549,  commission: 82  },
    ];
    const o1Total    = 1299 + 549 * 2;   // 2397
    const o1Comm     = 130  + 82 * 2;    // 294
    const o1Admin    = Math.round(o1Comm * 0.8);
    await client.query(
      `INSERT INTO orders
         (id, customer_id, customer_name, customer_email, store_id, store_name, items,
          subtotal, total, commission_total, admin_revenue, discount, shipping_charge, gst_amount,
          status, payment_method, payment_status, address, city, agent_id, agent_name, agent_code, agent_commission)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0,0,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO NOTHING`,
      [
        'ORD-SEED-001', ids.customer, 'Amit Kumar', 'amit.kumar@gmail.com',
        storeId, "Rahul's Electronics Hub", JSON.stringify(orderItems),
        o1Total, o1Total, o1Comm, o1Admin,
        'delivered', 'upi', 'paid',
        'Flat 301, Sai Nagar, Baner Road', 'Pune',
        ids.agent, 'Vikram Patel', 'AGT001', 5,
      ],
    );

    const o2Items = [{ productId: productIds[1], productName: 'Smart LED Desk Lamp', productIcon: '💡', productColor: '#F59E0B', quantity: 1, price: 1599, commission: 160 }];
    await client.query(
      `INSERT INTO orders
         (id, customer_id, customer_name, customer_email, store_id, store_name, items,
          subtotal, total, commission_total, admin_revenue, discount, shipping_charge, gst_amount,
          status, payment_method, payment_status, address, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,0,0,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        'ORD-SEED-002', ids.customer, 'Amit Kumar', 'amit.kumar@gmail.com',
        storeId, "Rahul's Electronics Hub", JSON.stringify(o2Items),
        1599, 1599, 160, 128,
        'processing', 'cod', 'pending',
        'Flat 301, Sai Nagar, Baner Road', 'Pune',
      ],
    );
    console.log('   ✓ 2 sample orders created');

    // ── 8. Sample Service Order ───────────────────────────────────────────────
    console.log('\n🔧 Creating sample service order...');
    await client.query(
      `INSERT INTO service_orders
         (id, service_id, service_title, service_icon, service_color,
          provider_id, provider_name, customer_id, customer_name, customer_email, customer_phone,
          amount, status, payment_status, scheduled_date, address, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING`,
      [
        'SVC-SEED-001', serviceIds[0], 'AC Repair & Deep Service', '❄️', '#0EA5E9',
        ids.provider, 'Priya Singh', ids.customer, 'Amit Kumar', 'amit.kumar@gmail.com', '9000000004',
        499, 'confirmed', 'pending', '2026-07-10',
        'Flat 301, Sai Nagar, Baner Road', 'Mumbai',
      ],
    );
    console.log('   ✓ 1 sample service order created');

    // ── 9. Notifications ──────────────────────────────────────────────────────
    console.log('\n🔔 Creating notifications...');
    const notifs = [
      { userId: ids.customer,   type: 'order',      title: 'Order Delivered!',          message: 'Your order ORD-SEED-001 has been delivered. Enjoy your purchase!' },
      { userId: ids.customer,   type: 'order',      title: 'Order Confirmed',            message: 'ORD-SEED-002 is confirmed and being processed.' },
      { userId: ids.storeOwner, type: 'order',      title: 'New Order Received',         message: 'You have a new order ORD-SEED-002 worth ₹1,599.' },
      { userId: ids.storeOwner, type: 'commission', title: 'Payment Credited',           message: '₹2,103 credited to your wallet for order ORD-SEED-001.' },
      { userId: ids.provider,   type: 'service',    title: 'New Service Booking',        message: 'AC Repair booked for 10 Jul 2026. Customer: Amit Kumar.' },
      { userId: ids.agent,      type: 'commission', title: 'Commission Earned',          message: '₹119.85 commission earned on order ORD-SEED-001.' },
      { userId: ids.admin,      type: 'system',     title: 'Platform Seeded',            message: 'Demo data has been seeded successfully. Welcome to AskIndia!' },
    ];
    for (const n of notifs) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1,$2,$3,$4)`,
        [n.userId, n.type, n.title, n.message],
      );
    }
    console.log(`   ✓ ${notifs.length} notifications created`);

    // ── 10. Homepage config ───────────────────────────────────────────────────
    console.log('\n🏠 Updating homepage config...');
    const heroSlides = [
      { id: 'slide_1', title: "Products & Services,\nAll in One Place", subtitle: 'Discover verified stores, book local services — tailored to your city.', ctaText: 'Shop Now', ctaLink: '/register/customer', secondaryCtaText: 'Open a Store', secondaryCtaLink: '/register/store-owner', gradientFrom: '#1e1b4b', gradientTo: '#4338ca', badge: "✨ India's Unified Marketplace", imageEmoji: '🛍️', isActive: true },
      { id: 'slide_2', title: "Book Trusted\nLocal Services",           subtitle: 'AC repair, home cleaning, tutoring & more — all with verified providers.',   ctaText: 'Book a Service', ctaLink: '/register/customer', secondaryCtaText: 'List Your Service', secondaryCtaLink: '/register/service-provider', gradientFrom: '#134e4a', gradientTo: '#0891b2', badge: '🔧 Verified Providers', imageEmoji: '🏠', isActive: true },
      { id: 'slide_3', title: "Launch Your\nOnline Store Today",         subtitle: 'Set up a branded storefront in minutes and reach customers across India.', ctaText: 'Open Free Store', ctaLink: '/register/store-owner', secondaryCtaText: 'Learn More', secondaryCtaLink: '/register/store-owner', gradientFrom: '#7c2d12', gradientTo: '#ea580c', badge: '🚀 Free to Start', imageEmoji: '🏪', isActive: true },
    ];
    const miniBanners = [
      { id: 'mb_1', title: 'Top Electronics', subtitle: 'Phones, earbuds & more', emoji: '📱', gradientFrom: '#ea580c', gradientTo: '#f97316', ctaText: 'Shop Now',    link: '/shop', isActive: true },
      { id: 'mb_2', title: 'Home Services',   subtitle: 'Cleaning, repair & more',  emoji: '🔧', gradientFrom: '#7c3aed', gradientTo: '#a855f7', ctaText: 'Book Now',   link: '/shop', isActive: true },
      { id: 'mb_3', title: 'Beauty & Care',   subtitle: 'Skincare & wellness',       emoji: '💆', gradientFrom: '#0369a1', gradientTo: '#0ea5e9', ctaText: 'Explore',    link: '/shop', isActive: true },
    ];
    const brandLogos = [
      { id: 'bl_1', name: 'Samsung', emoji: '🌀', isActive: true },
      { id: 'bl_2', name: 'Apple',   emoji: '🍎', isActive: true },
      { id: 'bl_3', name: 'Sony',    emoji: '🎵', isActive: true },
      { id: 'bl_4', name: 'OnePlus', emoji: '⚡', isActive: true },
      { id: 'bl_5', name: 'boAt',    emoji: '🎶', isActive: true },
      { id: 'bl_6', name: 'LG',      emoji: '📺', isActive: true },
    ];
    await client.query(
      `UPDATE homepage_config SET
         announcement_bar        = $1,
         announcement_bar_active = true,
         hero_slides             = $2,
         mini_banners            = $3,
         show_brand_logos        = true,
         brand_logos             = $4,
         show_trending_section   = true,
         show_best_deals         = true,
         show_collection_list    = true,
         newsletter_title        = 'Stay in the Loop',
         newsletter_subtitle     = 'Subscribe for new arrivals, festive offers & the latest updates',
         updated_at              = NOW()
       WHERE id = 1`,
      [
        '🔥 Welcome to AskIndia — Explore products & services near you!',
        JSON.stringify(heroSlides),
        JSON.stringify(miniBanners),
        JSON.stringify(brandLogos),
      ],
    );
    console.log('   ✓ Homepage config updated');

    await client.query('COMMIT');

    console.log('\n════════════════════════════════════════════════════════');
    console.log('✅ Seed complete!\n');
    console.log('Demo credentials:');
    console.log('─────────────────────────────────────────────────────────');
    console.log('Role               Email                          Password');
    console.log('─────────────────────────────────────────────────────────');
    console.log('Admin              admin@askindia.shop            Admin@1234');
    console.log('Store Owner        rahul@rahulelectronics.com     Store@1234');
    console.log('Service Provider   priya@homeclean.in             Service@1234');
    console.log('Customer           amit.kumar@gmail.com           Customer@1234');
    console.log('Agent              vikram.patel@agent.com         Agent@1234');
    console.log('════════════════════════════════════════════════════════\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed failed — rolled back:\n', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
