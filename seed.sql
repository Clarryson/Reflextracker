-- =============================================================================
-- Reflex Delivery Tracking System — Seed Demo Data
-- Password for all accounts: Password123!
-- =============================================================================

USE reflex_tracker;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE incidents;
TRUNCATE TABLE proof_of_delivery;
TRUNCATE TABLE delivery_history;
TRUNCATE TABLE deliveries;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Demo Users
-- -----------------------------------------------------------------------------
INSERT INTO users (id, name, email, phone, password_hash, role) VALUES
(1, 'Kamau Electronics', 'kamau@electronics.co.ke', '0712345678', '$2b$10$9MIpepRWIDbDVQoScsDBauCo.GtX93v27FeEgv0HqCh7aNYjuWBwW', 'RETAILER'),
(2, 'Aisha Pharma', 'aisha@pharma.co.ke', '0723456789', '$2b$10$9MIpepRWIDbDVQoScsDBauCo.GtX93v27FeEgv0HqCh7aNYjuWBwW', 'RETAILER'),
(3, 'Dispatcher Omondi', 'omondi@reflex.co.ke', '0734567890', '$2b$10$9MIpepRWIDbDVQoScsDBauCo.GtX93v27FeEgv0HqCh7aNYjuWBwW', 'DISPATCHER'),
(4, 'Rider Brian Mutua', 'brian@rider.co.ke', '0745678901', '$2b$10$9MIpepRWIDbDVQoScsDBauCo.GtX93v27FeEgv0HqCh7aNYjuWBwW', 'RIDER'),
(5, 'Rider Grace Wanjiru', 'grace@rider.co.ke', '0756789012', '$2b$10$9MIpepRWIDbDVQoScsDBauCo.GtX93v27FeEgv0HqCh7aNYjuWBwW', 'RIDER'),
(6, 'Rider James Otieno', 'james@rider.co.ke', '0767890123', '$2b$10$9MIpepRWIDbDVQoScsDBauCo.GtX93v27FeEgv0HqCh7aNYjuWBwW', 'RIDER');

-- -----------------------------------------------------------------------------
-- Demo Deliveries
-- -----------------------------------------------------------------------------
INSERT INTO deliveries (
  id, delivery_reference, retailer_id, rider_id,
  customer_name, customer_phone, delivery_address, item_description,
  status, qr_token, qr_verified, picked_up_at, delivered_at
) VALUES
(1, 'DEL-000001', 1, NULL, 'John Kamau', '0712345678', 'Kilimani, Nairobi', 'Samsung Galaxy A15', 'OPEN', 'REFLEX-DEL-000001-aabbcc1122334455667788990011aabb', 0, NULL, NULL),
(2, 'DEL-000002', 1, 4, 'Mary Wambui', '0798765432', 'Westlands, Nairobi', 'HP Laptop Charger', 'ASSIGNED', 'REFLEX-DEL-000002-bbccdd2233445566778899001122bbcc', 0, NULL, NULL),
(3, 'DEL-000003', 2, 5, 'Peter Mwangi', '0701234567', 'Karen, Nairobi', 'Blood Pressure Monitor', 'PICKED_UP', 'REFLEX-DEL-000003-ccddee3344556677889900112233ccdd', 0, NOW(), NULL),
(4, 'DEL-000004', 2, 4, 'Fatuma Hassan', '0711223344', 'South B, Nairobi', 'Glucometer Kit', 'DELIVERED', 'REFLEX-DEL-000004-ddeeff4455667788990011223344ddee', 1, DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW());

-- -----------------------------------------------------------------------------
-- Demo Delivery History
-- -----------------------------------------------------------------------------
INSERT INTO delivery_history (delivery_id, changed_by, previous_status, new_status, notes) VALUES
(1, 1, NULL, 'OPEN', 'Delivery created'),
(2, 1, NULL, 'OPEN', 'Delivery created'),
(2, 3, 'OPEN', 'ASSIGNED', 'Assigned to rider 4'),
(3, 2, NULL, 'OPEN', 'Delivery created'),
(3, 3, 'OPEN', 'ASSIGNED', 'Assigned to rider 5'),
(3, 5, 'ASSIGNED', 'PICKED_UP', 'Rider confirmed pickup'),
(4, 2, NULL, 'OPEN', 'Delivery created'),
(4, 3, 'OPEN', 'ASSIGNED', 'Assigned to rider 4'),
(4, 4, 'ASSIGNED', 'PICKED_UP', 'Rider confirmed pickup'),
(4, 4, 'PICKED_UP', 'DELIVERED', 'Delivery completed');
