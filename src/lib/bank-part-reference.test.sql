-- Read-only regression: a €1.09 first allocation and €90 remainder need distinct references.
SELECT 1 / CASE WHEN
 public.fin_bank_part_reference('dca9898c-adec-4fc9-b6e1-17d72b26f729'::uuid, 0, 1.09)
 = 'dca9898c-adec-4fc9-b6e1-17d72b26f729:109'
 AND public.fin_bank_part_reference('dca9898c-adec-4fc9-b6e1-17d72b26f729'::uuid, 1.09, 90)
 = 'dca9898c-adec-4fc9-b6e1-17d72b26f729:9109'
 AND public.fin_bank_part_reference('dca9898c-adec-4fc9-b6e1-17d72b26f729'::uuid, 0, 1.09)
 <> public.fin_bank_part_reference('dca9898c-adec-4fc9-b6e1-17d72b26f729'::uuid, 1.09, 90)
 THEN 1 ELSE 0 END AS passed;