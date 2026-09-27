CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'مكياج',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Menu is publicly viewable" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  delivery_date TEXT,
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'جديد',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER menu_items_updated_at BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.menu_items (name, description, price, category, sort_order) VALUES
('روج مطفي', 'أحمر شفاه بتركيبة مطفية طويلة الثبات بألوان متعددة', 25.00, 'مكياج', 1),
('كريم أساس', 'كريم أساس بتغطية متوسطة إلى كاملة ولمسة نهائية طبيعية', 35.00, 'مكياج', 2),
('سيروم فيتامين سي', 'سيروم مضاد للأكسدة يمنح البشرة إشراقة وتوهجًا طبيعيًا', 40.00, 'العناية بالبشرة', 3),
('كريم مرطب يومي', 'مرطب خفيف القوام مناسب لجميع أنواع البشرة', 30.00, 'العناية بالبشرة', 4);
-- Seed items ship with no photo — add real product photos for each from the admin panel
-- (the phone-code login described in README.md) once the store is live.