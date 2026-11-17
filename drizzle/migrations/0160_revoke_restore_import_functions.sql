REVOKE EXECUTE ON FUNCTION public.tk_import_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_restore_archive(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tk_import_snapshot(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fin_restore_archive(jsonb) TO service_role;