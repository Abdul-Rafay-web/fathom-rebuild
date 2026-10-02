import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'media';

let admin: ReturnType<typeof createClient> | null = null;
export function storageAdmin() {
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return admin.storage.from(BUCKET);
}

/** Short-lived read URL. Supabase serves it with HTTP range support, so players can seek. */
export async function signedReadUrl(path: string, expiresIn = 60 * 60 * 6) {
  const { data, error } = await storageAdmin().createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * The browser uploads straight to storage with this one-time URL. Vercel caps
 * request bodies at 4.5 MB, so media must never be proxied through our functions.
 */
export async function signedUploadUrl(path: string) {
  const { data, error } = await storageAdmin().createSignedUploadUrl(path);
  if (error) throw error;
  return data; // { signedUrl, token, path }
}
