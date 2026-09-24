-- Regression fixtures for the throwaway test database only.
-- :hash is a bcrypt hash of the test password, passed in by lib.sh.
INSERT INTO profiles (id, name, email, password_hash, role) VALUES
  ('00000000-0000-0000-0000-0000000000ad', 'Test Admin',   'admin@test.io',  :'hash', 'admin'),
  ('00000000-0000-0000-0000-0000000000dd', 'Driver',       'driver@test.io', :'hash', 'delivery_partner'),
  -- Legacy shape: a store created before store logins existed is owned by an admin.
  ('00000000-0000-0000-0000-00000000000a', 'Legacy Admin', 'legacyadmin@test.io', 'x', 'admin'),
  ('00000000-0000-0000-0000-00000000000c', 'Legacy Cust',  'legacycust@test.io',  'x', 'customer');
INSERT INTO stores (id, owner_id, owner_name, name, slug, status) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Legacy Admin', 'Legacy Store', 'legacy', 'active');
INSERT INTO products (id, store_id, name, price, status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'Legacy Product', 100, 'active');
-- Legacy order with no status history (tracking must synthesise its timeline).
INSERT INTO orders (id, customer_id, store_id, items, total, status, created_at) VALUES
  ('ORDLEGACY', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1',
   '[{"productId":"00000000-0000-0000-0000-0000000000b1","quantity":1}]', 100, 'shipped', NOW() - INTERVAL '2 days');
INSERT INTO reviews (order_id, product_id, customer_id, rating) VALUES
  ('ORDX', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c', 4);
