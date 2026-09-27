CREATE TABLE public.site_settings (
  id int PRIMARY KEY DEFAULT 1,
  story_label text NOT NULL DEFAULT 'قصتنا',
  story_title text NOT NULL DEFAULT 'لمسة سارة في كل قطعة',
  story_text text NOT NULL DEFAULT 'من مطبخ صغير إلى مركز متكامل للحلويات، نختار أجود المكوّنات ونُزيّن كل طبق بعناية لتصل إليك قطعة تليق بفرحتك.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings public read" ON public.site_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.site_settings (id) VALUES (1);

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.promotions TO anon, authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Promotions public read" ON public.promotions FOR SELECT TO anon, authenticated USING (true);