-- ============================================================================
-- GAURAV AUTOCARE - DATABASE SCHEMA
-- Fuel Truck Order Management & WhatsApp Automation System
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TRIGGER FUNCTION: Automatically update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. TABLE: customers
-- Stores registered fleet owners, truck drivers, transport companies & retail clients
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT 'Valued Customer',
  company_name VARCHAR(255),
  email VARCHAR(255),
  gstin VARCHAR(50),
  billing_address TEXT,
  credit_limit NUMERIC(12, 2) DEFAULT 0.00,
  outstanding_balance NUMERIC(12, 2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers (company_name);

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. TABLE: fuel_rates
-- Daily updated fuel prices for Petrol and Diesel at the pump
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fuel_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuel_type VARCHAR(50) UNIQUE NOT NULL CHECK (fuel_type IN ('Petrol', 'Diesel')),
  rate_per_litre NUMERIC(8, 2) NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial fuel rates (can be updated dynamically from dashboard or CRM)
INSERT INTO public.fuel_rates (fuel_type, rate_per_litre)
VALUES 
  ('Petrol', 104.50),
  ('Diesel', 92.80)
ON CONFLICT (fuel_type) 
DO UPDATE SET rate_per_litre = EXCLUDED.rate_per_litre, updated_at = NOW();

-- ============================================================================
-- 4. TABLE: fuel_truck_orders
-- Primary table storing all fuel truck orders placed via WhatsApp Flow
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fuel_truck_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  vehicle_number VARCHAR(50) NOT NULL,
  fuel_type VARCHAR(50) NOT NULL CHECK (fuel_type IN ('Petrol', 'Diesel')),
  litres NUMERIC(10, 2) NOT NULL CHECK (litres > 0),
  estimated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  rate_per_litre NUMERIC(8, 2),
  order_status VARCHAR(50) NOT NULL DEFAULT 'confirmed' 
    CHECK (order_status IN ('confirmed', 'queued', 'fueling', 'completed', 'cancelled')),
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' 
    CHECK (payment_status IN ('pending', 'paid', 'credit', 'partial')),
  delivery_type VARCHAR(50) DEFAULT 'truck_dispense',
  driver_assigned VARCHAR(255),
  notes TEXT,
  source VARCHAR(50) DEFAULT 'whatsapp_flow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_orders_ticket ON public.fuel_truck_orders (ticket_id);
CREATE INDEX IF NOT EXISTS idx_fuel_orders_phone ON public.fuel_truck_orders (phone);
CREATE INDEX IF NOT EXISTS idx_fuel_orders_vehicle ON public.fuel_truck_orders (vehicle_number);
CREATE INDEX IF NOT EXISTS idx_fuel_orders_status ON public.fuel_truck_orders (order_status);
CREATE INDEX IF NOT EXISTS idx_fuel_orders_created ON public.fuel_truck_orders (created_at DESC);

CREATE TRIGGER update_fuel_truck_orders_updated_at
BEFORE UPDATE ON public.fuel_truck_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. TABLE: bot_sessions
-- Tracks live WhatsApp chatbot state and conversational context
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  state VARCHAR(100) NOT NULL DEFAULT 'main_menu',
  flow_type VARCHAR(100) DEFAULT 'fuel_order',
  last_ticket_id VARCHAR(50),
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_phone ON public.bot_sessions (phone);

CREATE TRIGGER update_bot_sessions_updated_at
BEFORE UPDATE ON public.bot_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_truck_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service_role & authenticated full access
CREATE POLICY "Full access for service role on customers" ON public.customers
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role on fuel_rates" ON public.fuel_rates
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role on fuel_truck_orders" ON public.fuel_truck_orders
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role on bot_sessions" ON public.bot_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Allow anon public read access for fuel rates (so WhatsApp/web can fetch rates)
CREATE POLICY "Public read for fuel_rates" ON public.fuel_rates
  FOR SELECT USING (true);

-- ============================================================================
-- 7. DEMO / SAMPLE DATA
-- ============================================================================
INSERT INTO public.customers (phone, name, company_name, gstin)
VALUES 
  ('919876543210', 'Vikram Logistics', 'Vikram Freight Carriers Pvt Ltd', '27AABCV1234F1Z5'),
  ('919123456789', 'Gaurav Transport Desk', 'Gaurav Autocare Fleet', '24AABCG9876K1Z2')
ON CONFLICT (phone) DO NOTHING;
