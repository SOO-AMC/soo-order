-- =============================================================
-- Supabase SQL Schema for 의약품 관리대장 (Pharmaceutical Inventory)
-- Run this in the Supabase SQL Editor
-- =============================================================

-- 1. User Profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  pharmacy_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile, admins can read all
CREATE POLICY "Users can view own profile or admin can view all"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

-- Users can update their own profile (but not role), admins can update all
CREATE POLICY "Users can update own profile or admin can update all"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 5. Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================================
-- Orders Table for 주문/반품 (Order/Return Requests)
-- =============================================================

-- 1. Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('order', 'return')),
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'inspecting')),
  requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id),
  vendor_name TEXT NOT NULL DEFAULT '',
  confirmed_quantity INTEGER,
  invoice_received BOOLEAN,
  inspected_by UUID REFERENCES public.profiles(id),
  inspected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX idx_orders_created_at_desc ON public.orders (created_at DESC);
CREATE INDEX idx_orders_item_name ON public.orders (item_name);

-- 3. Reuse existing update_updated_at() trigger
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all orders
CREATE POLICY "Authenticated users can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

-- Users can create their own orders
CREATE POLICY "Users can create their own orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Admin or requester can update
CREATE POLICY "Admin or requester can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin())
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

-- Admin or requester can delete
CREATE POLICY "Admin or requester can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (requester_id = auth.uid() OR public.is_admin());
