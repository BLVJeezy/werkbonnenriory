ALTER TABLE public.quotes
  ADD COLUMN reminder_stage integer NOT NULL DEFAULT 0,
  ADD COLUMN reminder_sent_at timestamptz,
  ADD COLUMN reminder_error text;