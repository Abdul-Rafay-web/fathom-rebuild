// Local-dev network hardening for scripts: this machine's router DNS
// intermittently fails (EAI_AGAIN), so resolve via public DNS first and fall
// back to the OS resolver. Production (Vercel) never loads this.
import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

export function installDnsFallback() {
  const resolver = new dns.promises.Resolver({ timeout: 2000, tries: 2 });
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  // Raw TCP clients (the Postgres driver) go through dns.lookup, not undici.
  // Last good answer is cached for the life of the script (stale-while-revalidate
  // is overkill for a script that runs for minutes).
  const cache = new Map();
  const osLookup = dns.lookup;
  dns.lookup = (host, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    if (typeof opts === 'number') opts = { family: opts };
    const done = (a) => (opts?.all ? cb(null, a.map((address) => ({ address, family: 4 }))) : cb(null, a[0], 4));
    if (host === 'localhost' || /^[\d.]+$/.test(host)) return osLookup(host, opts, cb);
    if (cache.has(host)) return done(cache.get(host));
    resolver
      .resolve4(host)
      .then((a) => { cache.set(host, a); done(a); })
      .catch(() => osLookup(host, opts, cb));
  };
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup: (host, opts, cb) => {
          resolver
            .resolve4(host)
            .then((a) => (opts?.all ? cb(null, a.map((address) => ({ address, family: 4 }))) : cb(null, a[0], 4)))
            .catch(() => dns.lookup(host, opts, cb));
        },
      },
      headersTimeout: 300_000,
      bodyTimeout: 300_000,
    }),
  );
}
