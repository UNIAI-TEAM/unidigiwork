-- App role enum + user_roles table (chuẩn chống privilege escalation)
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role checker (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin rules (dùng cho notification/label rules — cấu hình chung)
CREATE TABLE public.admin_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'notification',
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_rules TO authenticated;
GRANT ALL ON public.admin_rules TO service_role;
ALTER TABLE public.admin_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone authenticated can view enabled rules" ON public.admin_rules
  FOR SELECT TO authenticated USING (is_enabled OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage rules" ON public.admin_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_admin_rules_updated_at
BEFORE UPDATE ON public.admin_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bootstrap: nếu chưa có admin nào, người dùng đầu tiên đăng nhập sẽ được trao quyền admin
-- (được kích hoạt qua server fn ensureBootstrapAdmin để tránh khai báo trigger phức tạp)