// API regression suite for store access, ownership, order workflow, tracking,
// reviews and password recovery. Run it through run-api-tests.sh, which builds
// a throwaway local database + API; never point it at a real environment.
//
// PHASE=main      full suite (OTP disabled)            — default
// PHASE=otp       email-OTP recovery flow (OTP enabled, fresh server)
// PHASE=otp-burn  5-wrong-guesses burn + forgot User ID (OTP enabled, fresh server)
// PHASE=accounts   account creation + every login type, verified in the DB
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const BASE = process.env.TEST_API_URL;
const DB   = process.env.TEST_DATABASE_URL;
const PHASE = process.env.PHASE ?? 'main';
if (!BASE || !DB) throw new Error('TEST_API_URL and TEST_DATABASE_URL are required (use run-api-tests.sh)');
for (const url of [BASE, DB]) {
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`Refusing to run against non-local host ${host}`);
}
const sql = (q) => execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-At', '-c', q]).toString().trim();

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✘ ${name} ${extra}`); }
}
async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json.data, error: json.error };
}
const login = async (email, password) => (await call('POST', '/auth/signin', { email, password }));
const RUN = Date.now().toString(36);
const section = (t) => console.log(`\n${t}`);

// Mail captured by the local SMTP sink (run-api-tests.sh starts it).
const decodeQP = (t) => t.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
function mailsTo(address, subject) {
  const file = process.env.MAIL_SINK_FILE;
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    .filter(m => m.to.includes(address.toLowerCase()) && subject.test(m.data))
    .map(m => decodeQP(m.data));
}
const otpFromMail = (address) => mailsTo(address, /Subject: Your AskIndia password reset code/).at(-1)?.match(/reset code is (\d{6})/)?.[1];
const wrongCode = (code) => code === '000000' ? '111111' : '000000';

if (PHASE === 'main') {
// ── AUTH ────────────────────────────────────────────────────────────────────
section('AUTH');
const adminLogin = await login('admin@test.io', 'AdminPass123');
check('admin login', adminLogin.status === 200 && adminLogin.data.user.role === 'admin');
const ADMIN = adminLogin.data.accessToken;
check('invalid credentials rejected (401)', (await login('admin@test.io', 'wrong-pass')).status === 401);
check('unknown User ID rejected (401)', (await login('nobody_here', 'whatever1')).status === 401);

for (const c of ['a', 'b']) {
  const r = await call('POST', '/auth/signup', { email: `cust${c}.${RUN}@test.io`, password: 'CustPass123', name: `Customer ${c.toUpperCase()}`, role: 'customer' });
  check(`customer ${c} signup`, r.status === 201, r.error);
}
const custA = await login(`custa.${RUN}@test.io`, 'CustPass123');
const custB = await login(`custb.${RUN}@test.io`, 'CustPass123');
check('customer login', custA.status === 200 && custA.data.user.role === 'customer');
const CA = custA.data.accessToken, CB = custB.data.accessToken;
const CA_ID = custA.data.user.id;
check('bad credentials get one generic message', (await login('admin@test.io', 'wrong-pass')).error === 'Invalid email/User ID or password');
const custMe = await call('GET', '/auth/me', undefined, CA);
check('customer /auth/me returns role', custMe.status === 200 && custMe.data.id === CA_ID && custMe.data.role === 'customer');
const refreshed = await call('POST', '/auth/refresh', { refreshToken: custB.data.refreshToken });
check('refresh token issues a working access token', refreshed.status === 200
  && (await call('GET', '/auth/me', undefined, refreshed.data.accessToken)).data?.email === `custb.${RUN}@test.io`, refreshed.error);
check('rotated refresh token cannot be reused', (await call('POST', '/auth/refresh', { refreshToken: custB.data.refreshToken })).status === 401);

// ── ADMIN CREATES STORES WITH LOGINS ───────────────────────────────────────
section('STORE ACCOUNTS');
const mkStore = (slug, storeType, username, extra = {}) => call('POST', '/stores', {
  name: `Store ${slug}`, slug, tagline: 't', city: 'Pune', storeType, status: 'active',
  ownerAccount: { name: `Owner ${slug}`, email: `${username}@test.io`, username, password: 'StorePass123' }, ...extra,
}, ADMIN);
const sA = await mkStore(`sa-${RUN}`, 'product', `storea_${RUN}`);
const sB = await mkStore(`sb-${RUN}`, 'product', `storeb_${RUN}`);
check('admin creates store A with its own login', sA.status === 201 && sA.data.ownerId !== adminLogin.data.user.id, sA.error);
check('admin creates store B with its own login', sB.status === 201, sB.error);
const STORE_A = sA.data.id, STORE_B = sB.data.id;
check('store owner password stored hashed (bcrypt)', sql(`select password_hash like '$2%' from profiles where username='storea_${RUN}'`) === 't');
check('admin profile store_id untouched', sql(`select coalesce(store_id::text,'') from profiles where id='${adminLogin.data.user.id}'`) === '');

check('duplicate User ID rejected', (await mkStore(`sx-${RUN}`, 'product', `storea_${RUN}`.toUpperCase())).status === 400);
check('duplicate slug rejected', (await mkStore(`sa-${RUN}`, 'product', `other_${RUN}`)).status === 400);
check('invalid User ID rejected', (await mkStore(`sy-${RUN}`, 'product', 'bad id@x')).status === 400);
const weak = await call('POST', '/stores', { name: 'W', slug: `w-${RUN}`, ownerAccount: { name: 'W', email: `w${RUN}@t.io`, username: `w_${RUN}`, password: 'short' } }, ADMIN);
check('weak password rejected', weak.status === 400);
check('failed create left no orphan login', sql(`select count(*) from profiles where username in ('other_${RUN}','w_${RUN}')`) === '0');

const stALogin = await login(`storea_${RUN}`, 'StorePass123');
check('store logs in with User ID', stALogin.status === 200 && stALogin.data.user.role === 'store_owner' && stALogin.data.user.storeId === STORE_A, stALogin.error);
check('store logs in with email too', (await login(`storea_${RUN}@test.io`, 'StorePass123')).status === 200);
check('User ID login is case-insensitive', (await login(`STOREA_${RUN}`, 'StorePass123')).status === 200);
const SA = stALogin.data.accessToken;
const storeMe = await call('GET', '/auth/me', undefined, SA);
check('store /auth/me returns role + store_id', storeMe.data?.role === 'store_owner' && storeMe.data.storeId === STORE_A && storeMe.data.username === `storea_${RUN}`);
check('customer cannot call store APIs', (await call('GET', '/reviews/received', undefined, CA)).status === 403);
const noLogin = await call('POST', '/stores', { name: 'Admin-owned', slug: `ao-${RUN}`, city: 'Pune' }, ADMIN);
check('admin store without its own login leaves admin store_id untouched', noLogin.status === 201
  && sql(`select coalesce(store_id::text,'') from profiles where id='${adminLogin.data.user.id}'`) === '', noLogin.error);
const SB = (await login(`storeb_${RUN}`, 'StorePass123')).data.accessToken;

check('store cannot call admin APIs', (await call('GET', '/admin/users', undefined, SA)).status === 403);
check('store cannot create another store for someone else', (await call('POST', '/stores/' + STORE_A + '/owner-account', { name: 'x', email: `x${RUN}@t.io`, username: `x_${RUN}`, password: 'StorePass123' }, SA)).status === 403);
check('anonymous self-signup as admin blocked', (await call('POST', '/auth/signup', { email: `evil${RUN}@t.io`, password: 'EvilPass123', name: 'Evil', role: 'admin' })).status === 403);
check('store cannot sign up a new admin', (await call('POST', '/auth/signup', { email: `evil2${RUN}@t.io`, password: 'EvilPass123', name: 'Evil', role: 'admin' }, SA)).status === 403);
check('admin can still create agent / delivery accounts', (await call('POST', '/auth/signup', { email: `agent${RUN}@t.io`, password: 'AgentPass123', name: 'Agent', role: 'agent' }, ADMIN)).status === 201);
check('customer cannot call admin APIs',(await call('GET', '/admin/stats', undefined, CA)).status === 403);
check('store cannot edit another store', (await call('PATCH', `/stores/${STORE_B}`, { tagline: 'hacked' }, SA)).status === 403);
const selfEdit = await call('PATCH', `/stores/${STORE_A}`, { tagline: 'Fresh', status: 'suspended', commissionRate: 0, walletBalance: 99999 }, SA);
check('store edits own profile; admin-only fields ignored', selfEdit.status === 200 && selfEdit.data.tagline === 'Fresh' && selfEdit.data.status === 'active' && selfEdit.data.walletBalance === 0 && selfEdit.data.commissionRate === 10, JSON.stringify(selfEdit.data ?? selfEdit.error));
check('store cannot re-point its profile at another store', (await call('PATCH', '/auth/me', { storeId: STORE_B }, SA)).status === 403);

// Legacy store owned by the admin → hand over to its own login.
const legacyStore = '00000000-0000-0000-0000-0000000000a1';
sql(`update stores set owner_id='00000000-0000-0000-0000-00000000000a', owner_name='Legacy Admin' where id='${legacyStore}'`); // re-runnable fixture
const legacyAcct = await call('POST', `/stores/${legacyStore}/owner-account`, { name: 'Legacy Owner', email: `legacy${RUN}@test.io`, username: `legacy_${RUN}`, password: 'StorePass123' }, ADMIN);
check('admin gives legacy admin-owned store its own login', legacyAcct.status === 200 && legacyAcct.data.ownerName === 'Legacy Owner', legacyAcct.error);
check('legacy store keeps its products/orders', sql(`select count(*) from orders where store_id='${legacyStore}'`) === '1');
const legacyAgain = await call('POST', `/stores/${legacyStore}/owner-account`, { name: 'Z', email: `z${RUN}@test.io`, username: `z_${RUN}`, password: 'StorePass123' }, ADMIN);
check('cannot take over a store that already has an owner', legacyAgain.status === 400);
const legacyOwner = await login(`legacy_${RUN}`, 'StorePass123');
check('legacy store login sees its existing order', (await call('GET', '/orders', undefined, legacyOwner.data.accessToken)).data?.some(o => o.id === 'ORDLEGACY'));

// ── ORDERS ─────────────────────────────────────────────────────────────────
section('ORDERS');
const productId = sql(`insert into products (store_id,name,price,stock,status) values ('${STORE_A}','Test Product',250,10,'active') returning id`).split('\n')[0];
const orderBody = (extra = {}) => ({
  customerId: 'someone-else', customerName: 'Customer A', customerEmail: `custa.${RUN}@test.io`,
  storeId: STORE_A, storeName: 'Store A', items: [{ productId, productName: 'Test Product', productIcon: '📦', productColor: '#000', quantity: 1, price: 250, commission: 10 }],
  subtotal: 250, total: 250, commissionTotal: 25, adminRevenue: 25, paymentMethod: 'cod', paymentStatus: 'paid',
  address: '1 Road', city: 'Pune', ...extra,
});
const o1 = await call('POST', '/orders', orderBody({ status: 'delivered' }), CA);
check('customer creates order', o1.status === 201, o1.error);
const O1 = o1.data.id;
check('order forced to caller + pending (no self-delivered orders)', o1.data.customerId === CA_ID && o1.data.status === 'pending');

check('store A sees the order', (await call('GET', '/orders', undefined, SA)).data.some(o => o.id === O1));
check('store B does not see it in list', !(await call('GET', '/orders', undefined, SB)).data.some(o => o.id === O1));
check('store B GET /orders/:id → 404', (await call('GET', `/orders/${O1}`, undefined, SB)).status === 404);
check('store B cannot update it', (await call('PATCH', `/orders/${O1}`, { status: 'processing' }, SB)).status === 404);
check('store B cannot cancel it', (await call('POST', `/orders/${O1}/cancel`, { reason: 'x' }, SB)).status === 404);

check('PENDING → DELIVERED rejected', (await call('PATCH', `/orders/${O1}`, { status: 'delivered' }, SA)).status === 403);
check('PENDING → DISPATCHED rejected', (await call('PATCH', `/orders/${O1}`, { status: 'shipped' }, SA)).status === 403);
const acc = await call('PATCH', `/orders/${O1}`, { status: 'processing', paymentStatus: 'refunded' }, SA);
check('PENDING → ACCEPTED ok', acc.status === 200 && acc.data.status === 'processing');
check('store cannot change payment status', acc.data.paymentStatus === 'paid');
const walletBefore = Number(sql(`select coalesce(balance,0) from wallets where user_id='${sA.data.ownerId}'`) || 0);
check('ACCEPTED → DISPATCHED ok', (await call('PATCH', `/orders/${O1}`, { status: 'shipped', trackingNumber: 'TRK1', courierName: 'BlueDart' }, SA)).data?.status === 'shipped');
check('DISPATCHED → DELIVERED ok', (await call('PATCH', `/orders/${O1}`, { status: 'delivered' }, SA)).data?.status === 'delivered');
check('DELIVERED → PENDING rejected', (await call('PATCH', `/orders/${O1}`, { status: 'pending' }, SA)).status === 403);
check('DELIVERED → CANCELLED rejected', (await call('PATCH', `/orders/${O1}`, { status: 'cancelled' }, SA)).status === 403);
check('dispatch + delivery recorded in history, attributed to the store login', sql(
  `select string_agg(status, '>' order by created_at) from order_status_history
   where order_id='${O1}' and status in ('shipped','delivered') and changed_by='${sA.data.ownerId}'`) === 'shipped>delivered');

// Customers cannot move their own order; store PATCH never reaches payment fields.
const oc = (await call('POST', '/orders', orderBody(), CA)).data.id;
check('customer cannot change order status (403)', (await call('PATCH', `/orders/${oc}`, { status: 'processing' }, CA)).status === 403
  && (await call('PATCH', `/orders/${oc}`, { status: 'cancelled' }, CA)).status === 403
  && sql(`select status from orders where id='${oc}'`) === 'pending');
const payBefore = sql(`select payment_status||'|'||payment_method||'|'||total||'|'||coalesce(razorpay_payment_id,'') from orders where id='${oc}'`);
const dispatchWithPayment = await call('PATCH', `/orders/${oc}`, { status: 'processing', paymentStatus: 'refunded', paymentMethod: 'card', total: 1, razorpayPaymentId: 'pay_forged' }, SA);
check('store status update ignores every payment field', dispatchWithPayment.status === 200 && dispatchWithPayment.data.status === 'processing'
  && sql(`select payment_status||'|'||payment_method||'|'||total||'|'||coalesce(razorpay_payment_id,'') from orders where id='${oc}'`) === payBefore, payBefore);
const adminMove = await call('PATCH', `/orders/${oc}`, { status: 'pending' }, ADMIN);
check('admin keeps unrestricted status changes (processing → pending)', adminMove.status === 200 && adminMove.data.status === 'pending', adminMove.error);
const walletAfter = Number(sql(`select balance from wallets where user_id='${sA.data.ownerId}'`));
check('existing wallet credit on paid+delivered still happens (to the store login)', walletAfter - walletBefore === 225, `${walletBefore} → ${walletAfter}`);

// Delivery partner keeps its existing flow.
const DRIVER = (await login('driver@test.io', 'AdminPass123')).data.accessToken;
const o2 = (await call('POST', '/orders', orderBody(), CA)).data.id;
check('driver cannot see a pending order', (await call('GET', `/orders/${o2}`, undefined, DRIVER)).status === 404);
await call('PATCH', `/orders/${o2}`, { status: 'processing' }, SA);
check('driver ships accepted order', (await call('PATCH', `/orders/${o2}`, { status: 'shipped' }, DRIVER)).data?.status === 'shipped');
check('driver cannot cancel', (await call('PATCH', `/orders/${o2}`, { status: 'cancelled' }, DRIVER)).status === 403);
check('driver delivers', (await call('PATCH', `/orders/${o2}`, { status: 'delivered' }, DRIVER)).data?.status === 'delivered');

// Store may cancel before dispatch, not after.
const o3 = (await call('POST', '/orders', orderBody(), CA)).data.id;
check('store cancels pending order', (await call('PATCH', `/orders/${o3}`, { status: 'cancelled', cancelReason: 'Out of stock' }, SA)).data?.status === 'cancelled');

// ── CUSTOMER TRACKING ──────────────────────────────────────────────────────
section('CUSTOMER TRACKING');
check('customer A sees own order', (await call('GET', `/orders/${O1}`, undefined, CA)).status === 200);
check("customer B cannot read A's order (IDOR)", (await call('GET', `/orders/${O1}`, undefined, CB)).status === 404);
check("customer B cannot track A's order", (await call('GET', `/orders/${O1}/tracking`, undefined, CB)).status === 404);
check("customer B cannot cancel A's order", (await call('POST', `/orders/${o3}/cancel`, { reason: 'x' }, CB)).status === 404);
check("customer B's list excludes A's orders", !(await call('GET', '/orders', undefined, CB)).data.some(o => o.customerId === CA_ID));
const tr = await call('GET', `/orders/${O1}/tracking`, undefined, CA);
const steps = tr.data?.timeline?.map(e => e.status).join('>');
check('timeline from DB: pending>processing>shipped>delivered', steps === 'pending>processing>shipped>delivered', steps);
check('timeline has timestamps', tr.data?.timeline?.every(e => !Number.isNaN(Date.parse(e.at))));
const trc = await call('GET', `/orders/${o3}/tracking`, undefined, CA);
check('cancel reason shown in timeline', trc.data?.timeline?.at(-1)?.note === 'Out of stock');
const legacyTr = await call('GET', '/orders/ORDLEGACY/tracking', undefined, ADMIN);
check('legacy order (no history) gets synthesised timeline', legacyTr.data?.timeline?.map(e => e.status).join('>') === 'pending>shipped', JSON.stringify(legacyTr.data?.timeline));

// ── REVIEWS ────────────────────────────────────────────────────────────────
section('REVIEWS');
const o4 = (await call('POST', '/orders', orderBody(), CA)).data.id;
check('review before delivery rejected', (await call('POST', '/reviews', { orderId: o4, productId, rating: 5 }, CA)).status === 400);
check('rating 6 rejected', (await call('POST', '/reviews', { orderId: O1, productId, rating: 6 }, CA)).status === 400);
check('rating 0 rejected', (await call('POST', '/reviews', { orderId: O1, productId, rating: 0 }, CA)).status === 400);
check('fractional rating rejected', (await call('POST', '/reviews', { orderId: O1, productId, rating: 4.5 }, CA)).status === 400);
check('non-numeric rating rejected', (await call('POST', '/reviews', { orderId: O1, productId, rating: 'abc' }, CA)).status === 400);
check("customer B cannot review A's order", (await call('POST', '/reviews', { orderId: O1, productId, rating: 1 }, CB)).status === 403);
check('store cannot review', (await call('POST', '/reviews', { orderId: O1, productId, rating: 5 }, SA)).status === 403);
check('product not in order rejected', (await call('POST', '/reviews', { orderId: O1, productId: '00000000-0000-0000-0000-0000000000b1', rating: 5 }, CA)).status === 400);
const rv = await call('POST', '/reviews', { orderId: O1, productId, rating: 5, reviewText: 'Great' }, CA);
check('customer reviews delivered order', rv.status === 200 && rv.data.storeId === STORE_A, rv.error);
await call('POST', '/reviews', { orderId: O1, productId, rating: 4, reviewText: 'Edited' }, CA);
check('re-submit updates, never duplicates', sql(`select count(*)||':'||max(rating) from reviews where order_id='${O1}'`) === '1:4');
const recA = await call('GET', '/reviews/received', undefined, SA);
check('store A sees its review (with item name)', recA.data?.some(r => r.orderId === O1 && r.itemName === 'Test Product'));
check('store B does not see it', !(await call('GET', '/reviews/received', undefined, SB)).data?.some(r => r.orderId === O1));
check('customer sees own review', (await call('GET', '/reviews/mine', undefined, CA)).data?.some(r => r.orderId === O1));
check("customer B cannot read A's order reviews", (await call('GET', `/reviews/order/${O1}`, undefined, CB)).status === 404);

// ── SERVICE STORE ──────────────────────────────────────────────────────────
section('SERVICE STORE');
const sS = await mkStore(`ss-${RUN}`, 'service', `svc_${RUN}`);
check('admin creates service store with login', sS.status === 201, sS.error);
const svcLogin = await login(`svc_${RUN}`, 'StorePass123');
check('service store logs in as service_provider', svcLogin.data?.user.role === 'service_provider' && svcLogin.data.user.storeId === sS.data.id);
const SV = svcLogin.data.accessToken;
const serviceId = sql(`insert into services (provider_id,provider_name,store_id,title,price,status) values ('${svcLogin.data.user.id}','Svc','${sS.data.id}','Plumbing',500,'active') returning id`).split('\n')[0];
const soBody = { serviceId, serviceTitle: 'Plumbing', serviceIcon: '🔧', serviceColor: '#000', providerId: svcLogin.data.user.id, providerName: 'Svc', customerId: 'x', customerName: 'A', customerEmail: 'a@a', amount: 500, scheduledDate: '2026-10-01', address: 'x', city: 'Pune' };
const so = await call('POST', '/service-orders', soBody, CA);
check('customer books service', so.status === 201 && so.data.customerId === CA_ID, so.error);
const SO = so.data.id;
check("customer B cannot read A's booking", (await call('GET', `/service-orders/${SO}`, undefined, CB)).status === 404);
check('store (product) cannot read service booking', (await call('GET', `/service-orders/${SO}`, undefined, SA)).status === 404);
check('PENDING → COMPLETED rejected', (await call('PATCH', `/service-orders/${SO}`, { status: 'completed' }, SV)).status === 403);
check('service review before completion rejected', (await call('POST', '/reviews', { orderId: SO, serviceId, rating: 5 }, CA)).status === 400);
for (const s of ['confirmed', 'in_progress', 'completed']) {
  check(`service → ${s}`, (await call('PATCH', `/service-orders/${SO}`, { status: s }, SV)).data?.status === s);
}
const str = await call('GET', `/service-orders/${SO}/tracking`, undefined, CA);
check('service timeline pending>confirmed>in_progress>completed', str.data?.timeline?.map(e => e.status).join('>') === 'pending>confirmed>in_progress>completed');
const srv = await call('POST', '/reviews', { orderId: SO, serviceId, rating: 4, reviewText: 'Good' }, CA);
check('customer reviews completed service', srv.status === 200 && srv.data.serviceId === serviceId, srv.error);
check('service rating/review_count updated', sql(`select rating||':'||review_count from services where id='${serviceId}'`) === '4.0:1');
check('service store sees its review', (await call('GET', '/reviews/received', undefined, SV)).data?.some(r => r.orderId === SO));
const so2 = (await call('POST', '/service-orders', soBody, CA)).data.id;
check('provider can decline a booking (rejected status now allowed)', (await call('POST', `/service-orders/${so2}/reject`, { reason: 'Busy' }, SV)).data?.status === 'rejected');

// ── PAYMENT REGRESSION (no payment code changed) ───────────────────────────
section('PAYMENT (regression only)');
const intent = await call('GET', `/payments/intent/${O1}`, undefined, CA);
check('payment intent endpoint unchanged', intent.status === 200 && intent.data.amount === 25000);
const o5 = (await call('POST', '/orders', orderBody({ paymentMethod: 'upi', paymentStatus: 'pending' }), CA)).data.id;
const wh = await fetch(`${BASE}/payments/cashfree/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: o5, order_status: 'PAID', order_amount: 250 } }, event_time: 'now' }) });
console.log(`  ℹ Cashfree success webhook → HTTP ${wh.status}: ${(await wh.json()).error ?? 'ok'}`);

// ── FORGOT PASSWORD (PASSWORD_RESET_OTP_ENABLED=false → reset-link flow) ───
section('RECOVERY (OTP disabled)');
const custAEmail = `custa.${RUN}@test.io`;
check('recovery-options reports otpEnabled=false', (await call('GET', '/auth/recovery-options')).data?.otpEnabled === false);
check('OTP endpoint 404 while disabled', (await call('POST', '/auth/forgot-password/otp', { identifier: custAEmail })).status === 404);
check('OTP verify 404 while disabled', (await call('POST', '/auth/forgot-password/verify-otp', { identifier: custAEmail, otp: '123456' })).status === 404);
check('forgot-username 404 while disabled', (await call('POST', '/auth/forgot-username', { email: custAEmail })).status === 404);
check('no OTP email sent while disabled', mailsTo(custAEmail, /Subject: Your AskIndia password reset code/).length === 0);
check('no OTP row created while disabled', sql(`select count(*) from password_resets r join profiles p on p.id=r.user_id where p.email='${custAEmail}' and r.kind='otp'`) === '0');
const fp = await call('POST', '/auth/forgot-password', { email: custAEmail });
const linkMail = mailsTo(custAEmail, /Subject: Reset your AskIndia password/).at(-1);
check('reset link emailed', fp.status === 200 && fp.data.emailSent === true && !!linkMail, fp.error);
const token = linkMail?.match(/reset-password\?token=([0-9a-f]{64})/)?.[1];
check('existing reset-link flow still works', (await call('POST', '/auth/reset-password', { token, newPassword: 'NewCustPass1' })).status === 200);
check('login with new password', (await login(custAEmail, 'NewCustPass1')).status === 200);
check('reset link is single-use', (await call('POST', '/auth/reset-password', { token, newPassword: 'Another123' })).status === 400);
} // end PHASE === 'main'

// ── EMAIL-OTP RECOVERY (feature flag on) ───────────────────────────────────
async function storeAccount(prefix) {
  const admin = (await login('admin@test.io', 'AdminPass123')).data.accessToken;
  const username = `${prefix}_${RUN}`;
  const r = await call('POST', '/stores', {
    name: `Store ${username}`, slug: `${prefix}-${RUN}`, tagline: 't', city: 'Pune', storeType: 'product',
    ownerAccount: { name: 'Owner', email: `${username}@test.io`, username, password: 'StorePass123' },
  }, admin);
  if (r.status !== 201) throw new Error(`could not create store account: ${r.error}`);
  return username;
}

if (PHASE === 'otp') {
  section('RECOVERY (OTP enabled)');
  check('recovery-options reports OTP enabled', (await call('GET', '/auth/recovery-options')).data?.otpEnabled === true);
  const user = await storeAccount('otp');
  const email = `${user}@test.io`;
  const r = await call('POST', '/auth/forgot-password/otp', { identifier: user });
  const code = otpFromMail(email);
  check('OTP emailed to the registered address', r.status === 200 && /^\d{6}$/.test(code ?? ''), r.error);
  check('OTP not in the API response', !!code && !JSON.stringify(r).includes(code) && Object.keys(r.data ?? {}).sort().join() === 'emailSent,message');
  check('OTP stored only as a hash', sql(`select count(*) from password_resets r join profiles p on p.id=r.user_id
    where p.username='${user}' and r.kind='otp' and length(r.token_hash)=64 and r.token_hash <> '${code}'`) === '1');
  const unknown = await call('POST', '/auth/forgot-password/otp', { identifier: 'nobody@x.io' });
  check('unknown account gets same generic response, no mail', unknown.data?.message === r.data.message && mailsTo('nobody@x.io', /./).length === 0);
  check('wrong OTP rejected', (await call('POST', '/auth/forgot-password/verify-otp', { identifier: user, otp: wrongCode(code) })).status === 400);
  const v = await call('POST', '/auth/forgot-password/verify-otp', { identifier: user, otp: code });
  check('correct OTP → reset token', v.status === 200 && !!v.data?.resetToken, v.error);
  check('OTP single-use', (await call('POST', '/auth/forgot-password/verify-otp', { identifier: user, otp: code })).status === 400);
  check('reset via existing endpoint', (await call('POST', '/auth/reset-password', { token: v.data?.resetToken, newPassword: 'ResetPass123' })).status === 200);
  check('store logs in with new password', (await login(user, 'ResetPass123')).status === 200);

  // Expiry: a fresh code whose 10 minutes have passed is refused.
  await call('POST', '/auth/forgot-password/otp', { identifier: email });
  const late = otpFromMail(email);
  sql(`update password_resets set expires_at = now() - interval '1 minute' where kind='otp' and used=false
       and user_id=(select id from profiles where username='${user}')`);
  check('expired OTP rejected', !!late && late !== code
    && (await call('POST', '/auth/forgot-password/verify-otp', { identifier: email, otp: late })).status === 400);
}

if (PHASE === 'otp-burn') {
  section('RECOVERY (OTP enabled — attempt limit)');
  const user = await storeAccount('burn');
  await call('POST', '/auth/forgot-password/otp', { identifier: user });
  const code = otpFromMail(`${user}@test.io`);
  for (let i = 0; i < 5; i++) await call('POST', '/auth/forgot-password/verify-otp', { identifier: user, otp: wrongCode(code) });
  check('OTP burned after 5 wrong guesses (correct code refused)', !!code
    && (await call('POST', '/auth/forgot-password/verify-otp', { identifier: user, otp: code })).status === 400);
  check('forgot-username emails the User ID', (await call('POST', '/auth/forgot-username', { email: `${user}@test.io` })).status === 200
    && mailsTo(`${user}@test.io`, /Subject: Your AskIndia User ID/).at(-1)?.includes(user));
}

// ── ACCOUNTS: every login type, checked down to the stored row ─────────────
if (PHASE === 'accounts') {
  section('ACCOUNT CREATION AND LOGIN');
  const admin = await login('admin@test.io', 'AdminPass123');
  check('existing admin email login', admin.status === 200 && admin.data.user.role === 'admin', admin.error);
  const ADMIN = admin.data.accessToken;
  const email = `fresh.${RUN}@test.io`;
  const su = await call('POST', '/auth/signup', { email, password: 'FreshPass123', name: 'Fresh', role: 'customer' });
  check('new customer account is created', su.status === 201, su.error);
  check('new account row: bcrypt hash, active, customer', sql(`select (password_hash like '$2%')::text||':'||is_active||':'||role from profiles where email='${email}'`) === 'true:true:customer');
  const fresh = await login(email, 'FreshPass123');
  check('new account email login', fresh.status === 200 && fresh.data.user.role === 'customer', fresh.error);
  const agent = await call('POST', '/auth/signup', { email: `agent.${RUN}@test.io`, password: 'AgentPass123', name: 'Agent', role: 'agent' }, ADMIN);
  check('admin-created account email login', agent.status === 201 && (await login(`agent.${RUN}@test.io`, 'AgentPass123')).status === 200, agent.error);
  for (const [type, role] of [['product', 'store_owner'], ['service', 'service_provider']]) {
    const username = `${type}_${RUN}`;
    const st = await call('POST', '/stores', {
      name: `Store ${username}`, slug: `${type}-${RUN}`, city: 'Pune', storeType: type,
      ownerAccount: { name: 'Owner', email: `${username}@test.io`, username, password: 'StorePass123' },
    }, ADMIN);
    check(`admin creates ${type} store with login`, st.status === 201, st.error);
    check(`${type} login row: username, bcrypt, role, store_id`, sql(
      `select username||':'||(password_hash like '$2%')::text||':'||role||':'||store_id from profiles where email='${username}@test.io'`,
    ) === `${username}:true:${role}:${st.data?.id}`);
    const r = await login(username, 'StorePass123');
    check(`${role} User ID login`, r.status === 200 && r.data.user.role === role && r.data.user.storeId === st.data?.id, r.error);
    check(`${role} cannot call admin APIs`, (await call('GET', '/admin/users', undefined, r.data?.accessToken)).status === 403);
  }
  check('admin store_id untouched', sql(`select coalesce(store_id::text,'') from profiles where email='admin@test.io'`) === '');
  check('wrong password rejected', (await login('product_' + RUN, 'nope-nope')).status === 401);
  check('unknown User ID rejected', (await login('ghost_' + RUN, 'StorePass123')).status === 401);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
