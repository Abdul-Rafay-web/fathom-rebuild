import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Reachable without signing in: the auth pages and public clip links.
const PUBLIC = [/^\/login(\/|$)/, /^\/auth\//, /^\/c\//];

/**
 * 1. Sends visitors without a valid session to /login (keeping where they were going).
 * 2. Keeps the Supabase session fresh: access tokens are short-lived, and Server
 *    Components can't write cookies, so the refresh happens here, before render.
 * This is a routing gate, not the authorization layer: every route and query
 * still checks access itself (API routes answer 401/404 rather than redirect).
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((r) => r.test(path)) || path.startsWith('/api/');
  let response = NextResponse.next({ request: { headers: request.headers } });

  const toLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  };

  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (!hasSession) return isPublic ? response : toLogin();

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
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub && !isPublic) return toLogin(); // expired or invalid session
  return response;
}

export const config = {
  // Everything except static assets and the polling/worker endpoint.
  matcher: ['/((?!_next/static|_next/image|icon|apple-icon|favicon|api/jobs|.*\.(?:svg|png|jpg|woff2)$).*)'],
};
