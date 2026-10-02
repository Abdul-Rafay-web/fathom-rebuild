import dns from 'node:dns';
import { sql } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  const t: Record<string, number | string> = {};
  let s = performance.now();
  await new Promise((r) => dns.lookup('aws-0-ap-southeast-2.pooler.supabase.com', (e, a) => { t.lookupResult = e ? String(e.code) : String(a); r(null); }));
  t.lookupMs = Math.round(performance.now() - s);
  console.log("DIAG lookup", JSON.stringify(t));
  t.patched = String(dns.lookup).includes('resolve4') ? 'yes' : 'no';
  s = performance.now();
  await sql`select 1`;
  t.query1Ms = Math.round(performance.now() - s);
  s = performance.now();
  await sql`select 1`;
  t.query2Ms = Math.round(performance.now() - s);
  console.log("DIAG", JSON.stringify(t));
  return Response.json(t);
}
