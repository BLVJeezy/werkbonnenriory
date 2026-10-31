ALTER TABLE public.quotes ADD COLUMN kind text NOT NULL DEFAULT 'offerte';
ALTER TABLE public.quotes ADD COLUMN customer_id uuid;
ALTER TABLE public.quotes ADD COLUMN damage_cause text;
ALTER TABLE public.quotes ADD COLUMN damage_findings text;
ALTER TABLE public.quotes ADD COLUMN photo_paths text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.quotes ADD CONSTRAINT quotes_kind_check CHECK (kind IN ('offerte','verzekering'));