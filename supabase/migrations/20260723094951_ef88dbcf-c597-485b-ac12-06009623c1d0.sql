
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_admin_all ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'it_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'it_admin'::app_role));

-- Clear data that FKs into auth.users so we can wipe users cleanly
TRUNCATE TABLE public.fabrication_materials, public.fabrications,
               public.purchase_invoices, public.purchase_orders RESTART IDENTITY CASCADE;

DELETE FROM auth.users;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'software.2040@pgel.in',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"IT Admin"}'::jsonb,
  now(),
  now()
);
