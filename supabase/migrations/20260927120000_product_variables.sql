-- Reusable named option lists (e.g. "Color" -> ["Red","Blue"], "Size" -> ["XL","S"]) that the
-- admin panel lets the store owner manage from a new "المتغيرات" (Variables) tab.
CREATE TABLE public.product_variables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  -- "option_values", not "values": avoids the reserved SQL keyword as a column name.
  option_values TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_variables TO anon;
GRANT SELECT ON public.product_variables TO authenticated;
GRANT ALL ON public.product_variables TO service_role;

ALTER TABLE public.product_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product variables are publicly viewable" ON public.product_variables
  FOR SELECT TO anon, authenticated USING (true);

-- Reuses the same trigger function the other admin-editable tables already use.
CREATE TRIGGER product_variables_updated_at BEFORE UPDATE ON public.product_variables
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Starter examples so the new tab isn't empty — edit or delete these any time from
-- لوحة التحكم → المتغيرات.
INSERT INTO public.product_variables (name, option_values, sort_order) VALUES
('Color', ARRAY['Red', 'Blue'], 0),
('Size', ARRAY['XL', 'S'], 1);
