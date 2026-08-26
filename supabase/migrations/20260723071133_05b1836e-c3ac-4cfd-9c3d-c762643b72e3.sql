
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('it_admin', 'hod', 'operator');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'it_admin' THEN 1 WHEN 'hod' THEN 2 ELSE 3 END
  LIMIT 1;
$$;

-- Profiles policies
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'hod'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'it_admin'));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'it_admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));

-- User roles policies
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'hod'));

-- Handle new user: first user becomes it_admin, others operator
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'it_admin';
  ELSE
    assigned_role := 'operator';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_read_all" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin')) WITH CHECK (public.has_role(auth.uid(), 'it_admin'));

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read_all" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_admin_write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin')) WITH CHECK (public.has_role(auth.uid(), 'it_admin'));

-- Materials
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  uom TEXT NOT NULL,
  minimum_stock NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materials_read_all" ON public.materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "materials_admin_write" ON public.materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin')) WITH CHECK (public.has_role(auth.uid(), 'it_admin'));

-- Purchase Orders
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_date DATE NOT NULL,
  po_number TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  po_quantity NUMERIC NOT NULL CHECK (po_quantity > 0),
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_read_all" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_write_admin_operator" ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "po_update_admin" ON public.purchase_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));
CREATE POLICY "po_delete_admin" ON public.purchase_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));

-- Purchase Invoices
CREATE TABLE public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  invoice_date DATE NOT NULL,
  invoice_number TEXT NOT NULL,
  received_quantity NUMERIC NOT NULL CHECK (received_quantity > 0),
  invoice_url TEXT,
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pi_read_all" ON public.purchase_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "pi_write_admin_operator" ON public.purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "pi_update_admin" ON public.purchase_invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));
CREATE POLICY "pi_delete_admin" ON public.purchase_invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));

-- Fabrications
CREATE TABLE public.fabrications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fab_date DATE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_quantity NUMERIC NOT NULL CHECK (product_quantity > 0),
  department_id UUID REFERENCES public.departments(id),
  supervisor_name TEXT,
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fabrications TO authenticated;
GRANT ALL ON public.fabrications TO service_role;
ALTER TABLE public.fabrications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fab_read_all" ON public.fabrications FOR SELECT TO authenticated USING (true);
CREATE POLICY "fab_write_admin_operator" ON public.fabrications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "fab_update_admin" ON public.fabrications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));
CREATE POLICY "fab_delete_admin" ON public.fabrications FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));

-- Fabrication Materials (consumption)
CREATE TABLE public.fabrication_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fabrication_id UUID NOT NULL REFERENCES public.fabrications(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  required_qty_per_product NUMERIC NOT NULL CHECK (required_qty_per_product >= 0),
  total_quantity NUMERIC NOT NULL CHECK (total_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fabrication_materials TO authenticated;
GRANT ALL ON public.fabrication_materials TO service_role;
ALTER TABLE public.fabrication_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fm_read_all" ON public.fabrication_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "fm_write_admin_operator" ON public.fabrication_materials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'it_admin') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "fm_update_admin" ON public.fabrication_materials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));
CREATE POLICY "fm_delete_admin" ON public.fabrication_materials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'));

-- Inventory view: current stock per material
CREATE OR REPLACE VIEW public.inventory_view
WITH (security_invoker = true) AS
SELECT
  m.id AS material_id,
  m.name,
  m.code,
  m.uom,
  m.minimum_stock,
  COALESCE(pur.total_purchased, 0) AS total_purchased,
  COALESCE(con.total_consumed, 0) AS total_consumed,
  COALESCE(pur.total_purchased, 0) - COALESCE(con.total_consumed, 0) AS current_stock,
  CASE
    WHEN COALESCE(pur.total_purchased, 0) - COALESCE(con.total_consumed, 0) < m.minimum_stock * 0.5 THEN 'critical'
    WHEN COALESCE(pur.total_purchased, 0) - COALESCE(con.total_consumed, 0) < m.minimum_stock THEN 'low'
    ELSE 'healthy'
  END AS status
FROM public.materials m
LEFT JOIN (
  SELECT po.material_id, SUM(pi.received_quantity) AS total_purchased
  FROM public.purchase_invoices pi
  JOIN public.purchase_orders po ON po.id = pi.po_id
  GROUP BY po.material_id
) pur ON pur.material_id = m.id
LEFT JOIN (
  SELECT material_id, SUM(total_quantity) AS total_consumed
  FROM public.fabrication_materials
  GROUP BY material_id
) con ON con.material_id = m.id;

GRANT SELECT ON public.inventory_view TO authenticated;

-- PO summary view (pending qty)
CREATE OR REPLACE VIEW public.po_summary_view
WITH (security_invoker = true) AS
SELECT
  po.id, po.po_date, po.po_number, po.supplier_name, po.material_id,
  m.name AS material_name, m.uom,
  po.po_quantity,
  COALESCE(SUM(pi.received_quantity), 0) AS received_quantity,
  po.po_quantity - COALESCE(SUM(pi.received_quantity), 0) AS pending_quantity,
  po.created_at
FROM public.purchase_orders po
JOIN public.materials m ON m.id = po.material_id
LEFT JOIN public.purchase_invoices pi ON pi.po_id = po.id
GROUP BY po.id, m.name, m.uom;

GRANT SELECT ON public.po_summary_view TO authenticated;

-- Seed masters
INSERT INTO public.products (name) VALUES ('Table'), ('Rack'), ('Stand'), ('Trolley');
INSERT INTO public.departments (name) VALUES ('Innovation'), ('Fabrication'), ('Assembly'), ('Quality');

INSERT INTO public.materials (name, code, uom, minimum_stock) VALUES
('40 TYPE PLACON ROLLER', 'PLC-40', 'MTR', 100),
('80 TYPE PLACON ROLLER', 'PLC-80', 'MTR', 100),
('40 TYPE A1 JOINT', 'A1-40', 'PCS', 200),
('80 TYPE A1 JOINT', 'A1-80', 'PCS', 200),
('40 TYPE B2 JOINT', 'B2-40', 'PCS', 200),
('80 TYPE B2 JOINT', 'B2-80', 'PCS', 200),
('PJ1', 'PJ1', 'SET', 200),
('P100 JOINT', 'P100', 'SET', 200),
('PJ14 JOINT', 'PJ14', 'SET', 200),
('PJ16 JOINT', 'PJ16', 'SET', 200),
('PJ18 JOINT', 'PJ18', 'SET', 200),
('PJ2 JOINT', 'PJ2', 'SET', 200),
('PJ3 JOINT', 'PJ3', 'SET', 200),
('PJ4 JOINT', 'PJ4', 'SET', 200),
('PJ5 JOINT', 'PJ5', 'SET', 200),
('PJ7 JOINT', 'PJ7', 'SET', 200),
('PJ8 JOINT', 'PJ8', 'SET', 200),
('PJ15 JOINT', 'PJ15', 'SET', 200),
('SS PIPE', 'SS-PIPE', 'MTR', 500),
('6X2 PU WHEEL SWIVEL LOCK', 'PU-6X2-SL', 'PCS', 100),
('6X2 PU WHEEL FIXED', 'PU-6X2-F', 'PCS', 100),
('3x1.25 PU WHEEL SWIVEL', 'PU-3-S', 'PCS', 100),
('3x1.25 PU WHEEL SWIVEL LOCK', 'PU-3-SL', 'PCS', 100),
('END CAP', 'END-CAP', 'PCS', 300);
