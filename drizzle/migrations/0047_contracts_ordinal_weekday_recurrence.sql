ALTER TABLE public.contracts ADD COLUMN repeat_ordinal integer;
ALTER TABLE public.contracts ADD COLUMN repeat_weekday integer;
COMMENT ON COLUMN public.contracts.repeat_ordinal IS 'Welke weekdag in de maand: 1=e eerste, 2=tweede, 3=derde, 4=vierde, 5=laatste. NULL = op vaste datum.';
COMMENT ON COLUMN public.contracts.repeat_weekday IS 'Weekdag voor repeat_ordinal: 0=maandag t.e.m. 6=zondag.';