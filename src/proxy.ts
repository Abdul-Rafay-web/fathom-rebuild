import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps the Supabase session fresh: access tokens are short-lived, and Server
 * Components can't write cookies, so the refresh happens here, before render.
 * This is not the authorization layer; every route and query checks access itself.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  // Only pay for a session check when a session cookie exists.
  if (!request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Pages and server actions. Skip static assets, the public clip pages, and
  // the polling/worker endpoints, which don't need a refreshed session.
  matcher: ['/((?!_next/static|_next/image|icon|apple-icon|favicon|c/|api/jobs|.*\\.(?:svg|png|jpg|woff2)$).*)'],
};
