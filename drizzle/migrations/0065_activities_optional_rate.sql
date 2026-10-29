ALTER TABLE public.activities ALTER COLUMN hourly_rate DROP NOT NULL;
COMMENT ON COLUMN public.activities.hourly_rate IS 'Uurtarief excl. btw; NULL = geen tarief (arbeid wordt niet aangerekend)';