// Development-only DNS fallback, loaded from instrumentation.ts on the Node.js
// runtime. See instrumentation.ts for why.
export async function installDevDns() {
  console.log('[dev-dns] installing public-DNS fallback');
  // Patch the CommonJS object (the ESM namespace is read-only); net.connect reads from it.
  const dns = (await import('node:dns')).default;
  const resolver = new dns.promises.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  const cache = new Map<string, { ips: string[]; at: number }>();
  const osLookup = dns.lookup;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dns as any).lookup = (host: string, opts: any, cb: any) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (typeof opts === 'number') opts = { family: opts };
    const done = (ips: string[]) => (opts?.all ? cb(null, ips.map((address) => ({ address, family: 4 }))) : cb(null, ips[0], 4));
    const hit = cache.get(host);
    if (hit && Date.now() - hit.at < 300_000) return done(hit.ips);
    resolver
      .resolve4(host)
      .then((ips) => { cache.set(host, { ips, at: Date.now() }); done(ips); })
      .catch(() => osLookup(host, opts, cb));
  };
}
