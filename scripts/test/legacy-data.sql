-- Production-shaped rows on the pre-migration schema (baseline-schema.sql), so
-- the migration test can prove existing data survives. Throwaway DB only.
-- :hash is a bcrypt hash of the test password, passed in by the test script.
INSERT INTO profiles (id, name, email, password_hash, role, phone, city) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Old Customer',    'oldcust@test.io',     :'hash', 'customer',         '9000000001', 'Pune'),
  ('11111111-0000-0000-0000-000000000002', 'Old Store Owner', 'oldowner@test.io',    :'hash', 'store_owner',      NULL,         'Delhi'),
  ('11111111-0000-0000-0000-000000000003', 'Old Provider',    'oldprovider@test.io', :'hash', 'service_provider', NULL,         'Mumbai'),
  ('11111111-0000-0000-0000-000000000004', 'Old Agent',       'oldagent@test.io',    :'hash', 'agent',            NULL,         NULL);

INSERT INTO stores (id, owner_id, owner_name, name, slug, status, store_type) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'Old Store Owner', 'Old Store',    'old-store',    'active', 'product'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'Old Provider',    'Old Services', 'old-services', 'active', 'service');
UPDATE profiles SET store_id = '22222222-0000-0000-0000-000000000001' WHERE id = '11111111-0000-0000-0000-000000000002';
UPDATE profiles SET store_id = '22222222-0000-0000-0000-000000000002' WHERE id = '11111111-0000-0000-0000-000000000003';

INSERT INTO agents (id, agent_code, status) VALUES ('11111111-0000-0000-0000-000000000004', 'AGT900', 'active');
INSERT INTO products (id, store_id, name, price, stock, status) VALUES
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Old Product', 499, 5, 'active');
INSERT INTO services (id, provider_id, provider_name, store_id, title, price, status) VALUES
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'Old Provider',
   '22222222-0000-0000-0000-000000000002', 'Old Cleaning', 999, 'active');

-- One order per status, with the payment fields a gateway would have written.
INSERT INTO orders (id, customer_id, customer_name, customer_email, store_id, store_name, items,
                    subtotal, total, commission_total, admin_revenue, status, payment_method,
                    payment_status, razorpay_order_id, razorpay_payment_id, agent_id, agent_code, created_at)
SELECT 'ORDOLD-' || v.s, '11111111-0000-0000-0000-000000000001', 'Old Customer', 'oldcust@test.io',
       '22222222-0000-0000-0000-000000000001', 'Old Store',
       '[{"productId":"33333333-0000-0000-0000-000000000001","quantity":1,"price":499}]',
       499, 499, 49.9, 49.9, v.s, v.pm, v.ps, v.rzp_order, v.rzp_pay,
       '11111111-0000-0000-0000-000000000004', 'AGT900', NOW() - INTERVAL '10 days'
FROM (VALUES ('pending',    'cod',  'pending',  NULL,       NULL),
             ('processing', 'upi',  'paid',     'order_p1', 'pay_p1'),
             ('shipped',    'card', 'paid',     'order_p2', 'pay_p2'),
             ('delivered',  'upi',  'paid',     'order_p3', 'pay_p3'),
             ('cancelled',  'upi',  'refunded', 'order_p4', 'pay_p4')) AS v(s, pm, ps, rzp_order, rzp_pay);

INSERT INTO service_orders (id, service_id, service_title, provider_id, provider_name, customer_id,
                            customer_name, customer_email, amount, status, payment_status, scheduled_date)
SELECT 'SVCOLD-' || v.s, '44444444-0000-0000-0000-000000000001', 'Old Cleaning',
       '11111111-0000-0000-0000-000000000003', 'Old Provider', '11111111-0000-0000-0000-000000000001',
       'Old Customer', 'oldcust@test.io', 999, v.s, v.ps, '2026-09-01'
FROM (VALUES ('pending', 'pending'), ('confirmed', 'paid'), ('in_progress', 'paid'),
             ('completed', 'paid'), ('cancelled', 'refunded')) AS v(s, ps);

INSERT INTO reviews (order_id, product_id, customer_id, store_id, rating, review_text) VALUES
  ('ORDOLD-delivered', '33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   '22222222-0000-0000-0000-000000000001', 5, 'Great');

INSERT INTO password_resets (user_id, token_hash, expires_at, used) VALUES
  ('11111111-0000-0000-0000-000000000001', 'legacy-unused-token-hash', NOW() + INTERVAL '1 hour', false),
  ('11111111-0000-0000-0000-000000000001', 'legacy-used-token-hash',   NOW() - INTERVAL '1 day',  true);

INSERT INTO wallets (id, user_id, balance, pending, total_earned, withdrawn) VALUES
  ('55555555-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 1234.50, 100, 2000, 665.50);
INSERT INTO wallet_transactions (wallet_id, type, amount, description, reference_id, reference_type) VALUES
  ('55555555-0000-0000-0000-000000000001', 'credit', 449.10, 'Order ORDOLD-delivered', 'ORDOLD-delivered', 'order'),
  ('55555555-0000-0000-0000-000000000001', 'debit',  665.50, 'Payout', NULL, 'withdrawal');
INSERT INTO withdrawal_requests (entity_type, entity_id, entity_name, owner_name, amount, bank_account, ifsc, status) VALUES
  ('store', '22222222-0000-0000-0000-000000000001', 'Old Store', 'Old Store Owner', 665.50, '000111222', 'HDFC0000001', 'processed');
INSERT INTO notifications (user_id, type, title, message) VALUES
  ('11111111-0000-0000-0000-000000000001', 'order', 'Order shipped', 'ORDOLD-shipped is on its way');
