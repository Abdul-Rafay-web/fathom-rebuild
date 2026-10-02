// Development-only DNS fallback, loaded from instrumentation.ts on the Node.js
// runtime. See instrumentation.ts for why.
//
// Stale-while-revalidate: once a host has resolved, its last good address is
// served immediately forever and refreshed in the background. A flaky resolver
// then costs nothing after the first lookup. Without this, every new pooled DB
// connection (idle ones close after 20 s) re-resolves, and one hung OS lookup
// can stall a request for minutes.
export async function installDevDns() {
  console.log('[dev-dns] installing public-DNS fallback (stale-while-revalidate)');
  // Patch the CommonJS object (the ESM namespace is read-only); net.connect reads from it.
  const dns = (await import('node:dns')).default;
  const resolver = new dns.promises.Resolver({ timeout: 2000, tries: 2 });
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  const cache = new Map<string, { ips: string[]; at: number }>();
  const inflight = new Map<string, Promise<string[]>>();
  const osLookup = dns.lookup;

  const refresh = (host: string) => {
    let p = inflight.get(host);
    if (!p) {
      p = resolver
        .resolve4(host)
        .then((ips) => { cache.set(host, { ips, at: Date.now() }); return ips; })
        .finally(() => inflight.delete(host));
      inflight.set(host, p);
    }
    return p;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dns as any).lookup = (host: string, opts: any, cb: any) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (typeof opts === 'number') opts = { family: opts };
    const done = (ips: string[]) => (opts?.all ? cb(null, ips.map((address) => ({ address, family: 4 }))) : cb(null, ips[0], 4));
    if (host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return osLookup(host, opts, cb);
    const hit = cache.get(host);
    if (hit) {
      if (Date.now() - hit.at > 300_000) refresh(host).catch(() => {}); // revalidate in background
      return done(hit.ips);
    }
    refresh(host).then(done).catch(() => osLookup(host, opts, cb));
  };
}
