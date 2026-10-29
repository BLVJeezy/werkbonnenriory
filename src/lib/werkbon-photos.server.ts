import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Private photo bytes, read with the caller's RLS-scoped client, never public URLs. */
export async function loadWerkbonPhotos(supabase: SupabaseClient<Database>, workOrderId: string): Promise<Uint8Array[]> {
  const { data, error } = await supabase.from('work_order_photos')
    .select('path').eq('work_order_id', workOrderId).order('created_at').order('id');
  if (error) throw new Error('Foto’s van de werkbon konden niet geladen worden');
  const photos: Uint8Array[] = [];
  for (const photo of data ?? []) {
    const { data: file, error: downloadError } = await supabase.storage.from('werkbon-fotos').download(photo.path);
    if (downloadError || !file) throw new Error('Een foto kon niet geladen worden; de werkbon is niet verzonden');
    photos.push(new Uint8Array(await file.arrayBuffer()));
  }
  return photos;
}